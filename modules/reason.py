import json
import os
from modules.module import Module
from utils.claude import OPUS
from utils.colors import print_error, print_state, _MAGENTA
from utils.conversation import ConversationStore, stream_response
from utils.function_calls import contains_function_call_markup, maybe_dispatch_module_call
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

    Input: a question/task string. Maintains a session-scoped reason conversation
    log so intermediate reasoning context is saved across module calls. Returns
    either a direct answer or a single module-call payload for the main loop.
    """

    def __init__(self, registry=None):
        super().__init__(registry)
        self.store = ConversationStore("reason")
        self.messages = []
        self.reason_conversation_id = None

    def run(self, data) -> dict:
        question = data["input"]
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
        try:
            print_state("[Reason] Running OPUS reasoning...")
            answer = stream_response(
                self.messages,
                OPUS,
                "Reasoning:",
                _MAGENTA,
                hide_fn_calls=True,
            )
            self.messages.append({"role": "assistant", "content": answer})
            self._persist()

            module_result = maybe_dispatch_module_call(self, answer)
            if module_result:
                print_state(f"[Reason] Calling module: {module_result.get('module')}")
                module_result["called_module"] = module_result["module"]
                module_result["reason_conversation_id"] = self.reason_conversation_id
                return module_result
            if contains_function_call_markup(answer):
                print_error(
                    "Malformed function call:",
                    "Ignored XML call markup because it was not a single valid top-level call.",
                )
            print_state("[Reason] Returning direct answer.")
            clear_reason_state()
            return self.complete(answer)
        except Exception as e:
            print_error("Reasoning error:", str(e))
            return self.fail(str(e))
