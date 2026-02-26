import json
import os
from modules.module import Module
from utils.claude import OPUS
from utils.colors import print_error, print_state, _MAGENTA
from utils.conversation import (
    ConversationRuntime,
    ConversationStore,
    WAIT_SIGNAL,
)
from utils.prompts import load_system_prompt
from utils.session import state_path


def save_reason_state(messages, reason_conversation_id: str):
    path = state_path("reason_state.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(
            {
                "messages": messages,
                "reason_conversation_id": reason_conversation_id,
            },
            f,
            indent=2,
        )


def load_reason_state():
    with open(state_path("reason_state.json")) as f:
        return json.load(f)


def clear_reason_state():
    path = state_path("reason_state.json")
    if os.path.exists(path):
        os.remove(path)


class ReasonModule(Module):
    """Reason deeply with OPUS before acting on complex tasks.

    Input contract: `data["input"]` is a plain text string (question/task).
    Maintains a session-scoped reason conversation
    log so intermediate reasoning context is saved across module calls. Returns
    either a direct answer or a single module-call payload for the main loop.
    """

    def __init__(self, registry=None):
        super().__init__(registry)
        self.store = ConversationStore("reason")
        self.messages = []
        self.reason_conversation_id = None

    def run(self, data) -> dict:
        question = self.input_text(data)
        modules_info = json.dumps({k: v for k, v in self.registry.items() if k != "reason"}, indent=2)
        system = load_system_prompt("reason.md", {"AVAILABLE_MODULES_JSON": modules_info})

        self.reason_conversation_id = self.store.next_root_id()
        self.messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": question}
        ]
        self._persist()
        return self._loop()

    def resume(self, result) -> dict:
        if not self.messages:
            try:
                state = load_reason_state()
                self.messages = state.get("messages", [])
                self.reason_conversation_id = state.get("reason_conversation_id")
            except FileNotFoundError:
                return self.fail("Reason state not found; cannot resume.")

        called_module = result.get("called_module", "module")
        self.messages.append({"role": "user", "content": f"[{called_module} output]: {result['output']}"})
        self._persist()
        return self._loop()

    def _persist(self):
        if not self.reason_conversation_id:
            return
        save_reason_state(self.messages, self.reason_conversation_id)
        self.store.save(self.reason_conversation_id, json.dumps(self.messages, indent=2))

    def _loop(self) -> dict:
        print_state("[Reason] Running OPUS reasoning...")
        runtime = ConversationRuntime(self, self.messages, self._persist)

        def on_module_result(module_result: dict) -> dict:
            print_state(f"[Reason] Calling module: {module_result.get('module')}")
            module_result["called_module"] = module_result["module"]
            module_result["reason_conversation_id"] = self.reason_conversation_id
            return module_result

        result = runtime.run_autonomous_loop(
            model=OPUS,
            label="Reasoning:",
            label_color=_MAGENTA,
            hide_fn_calls=True,
            include_called_module=False,
            continue_user_text=None,
            on_module_result=on_module_result,
            pause_module_name="reason",
            pause_conversation_key="reason_conversation_id",
            pause_conversation_id=self.reason_conversation_id,
        )

        if "module" in result:
            return result
        if "error" in result:
            print_error("Reasoning error:", result["error"])
            return self.fail(result["error"])

        wait_payload = {}
        output = result.get("output", "")
        if isinstance(output, str) and output.strip().startswith("{"):
            try:
                wait_payload = json.loads(output)
            except Exception:
                wait_payload = {}
        if wait_payload.get("signal") == WAIT_SIGNAL:
            return self.complete(json.dumps(wait_payload, indent=2))

        print_state("[Reason] Returning direct answer.")
        clear_reason_state()
        return self.complete(result.get("output", ""))
