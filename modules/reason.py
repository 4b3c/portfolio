import json
import os
from time import time
from modules.module import Module
from utils.claude import call_claude, OPUS
from utils.colors import print_error, print_state, stream_label, stream_end, LineStream, _MAGENTA, _WHITE
from utils.function_calls import maybe_dispatch_module_call
from utils.prompts import load_system_prompt
from utils.session import conversations_dir, state_path


def new_reason_id():
    return (str(int(time())) + "0")[-12:-1]


def save_reason_conversation(messages, reason_conversation_id: str):
    path = os.path.join(conversations_dir(), f"reason_{reason_conversation_id}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(messages, f, indent=2)


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
    """Think through a complex, multi-step problem using a powerful reasoning model before acting. Input: the question or task to reason through. Use this before taking action on anything non-trivial — architecture decisions, debugging strategies, planning sequences of edits, or any task where getting it wrong would be costly. Returns either a reasoned answer or a module call to execute next."""

    def __init__(self, registry=None):
        super().__init__(registry)
        self.messages = []
        self.reason_conversation_id = None

    def run(self, data) -> dict:
        question = data["input"]
        modules_info = json.dumps({k: v for k, v in self.registry.items() if k != "reason"}, indent=2)
        system = load_system_prompt("reason.md", {"AVAILABLE_MODULES_JSON": modules_info})

        self.reason_conversation_id = new_reason_id()
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
        save_reason_conversation(self.messages, self.reason_conversation_id)

    def _loop(self) -> dict:
        try:
            print_state("[Reason] Running OPUS reasoning...")
            stream_label("Reasoning:", _MAGENTA)
            ls = LineStream(_WHITE)
            answer = call_claude(self.messages, model=OPUS, on_token=ls.token).strip()
            ls.flush()
            stream_end()
            self.messages.append({"role": "assistant", "content": answer})
            self._persist()

            module_result = maybe_dispatch_module_call(self, answer)
            if module_result:
                print_state(f"[Reason] Calling module: {module_result.get('module')}")
                module_result["called_module"] = module_result["module"]
                module_result["reason_conversation_id"] = self.reason_conversation_id
                return module_result
            print_state("[Reason] Returning direct answer.")
            clear_reason_state()
            return self.complete(answer)
        except Exception as e:
            print_error("Reasoning error:", str(e))
            return self.fail(str(e))
