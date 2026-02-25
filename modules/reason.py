import json
from modules.module import Module
from utils.claude import call_claude, OPUS
from utils.colors import print_error, stream_label, stream_end, LineStream, _MAGENTA, _WHITE
from utils.function_calls import maybe_dispatch_module_call
from utils.prompts import load_system_prompt

class ReasonModule(Module):
    """Think through a complex, multi-step problem using a powerful reasoning model before acting. Input: the question or task to reason through. Use this before taking action on anything non-trivial — architecture decisions, debugging strategies, planning sequences of edits, or any task where getting it wrong would be costly. Returns either a reasoned answer or a module call to execute next."""

    def run(self, data) -> dict:
        question = data["input"]
        modules_info = json.dumps({k: v for k, v in self.registry.items() if k != "reason"}, indent=2)
        system = load_system_prompt("reason.md", {"AVAILABLE_MODULES_JSON": modules_info})

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": question}
        ]
        try:
            stream_label("Reasoning:", _MAGENTA)
            ls = LineStream(_WHITE)
            answer = call_claude(messages, model=OPUS, on_token=ls.token).strip()
            ls.flush()
            stream_end()
            module_result = maybe_dispatch_module_call(self, answer)
            if module_result:
                return module_result
            return self.complete(answer)
        except Exception as e:
            print_error("Reasoning error:", str(e))
            return self.fail(str(e))
