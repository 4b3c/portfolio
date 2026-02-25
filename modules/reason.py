import json
import re
from modules.module import Module
from utils.claude import call_claude, OPUS
from utils.colors import print_error, stream_label, stream_end, LineStream, _MAGENTA, _WHITE
from utils.prompts import load_system_prompt

FUNCTION_CALL_RE = re.compile(r"<function_calls>\s*<invoke name=\"(\w+)\">(.*?)</invoke>\s*</function_calls>", re.DOTALL)
PARAM_RE = re.compile(r'<parameter name="(\w+)">(.*?)</parameter>', re.DOTALL)


def extract_module_call(text: str):
    match = FUNCTION_CALL_RE.search(text)
    if not match:
        return None
    module_name = match.group(1)
    params = {m.group(1): m.group(2) for m in PARAM_RE.finditer(match.group(2))}
    if len(params) == 1 and "input" in params:
        input_val = params["input"]
    else:
        input_val = json.dumps(params)
    return {"module": module_name, "input": input_val}

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
            parsed = extract_module_call(answer)
            if parsed:
                return self.call(parsed["module"], parsed.get("input", ""))
            return self.complete(answer)
        except Exception as e:
            print_error("Reasoning error:", str(e))
            return self.fail(str(e))
