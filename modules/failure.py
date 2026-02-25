import json
import os
import re
from modules.module import Module
from utils.colors import print_error, stream_label, stream_end, LineStream, _RED, _WHITE
from utils.prompts import load_system_prompt

FUNCTION_CALL_RE = re.compile(r"<function_calls>\s*<invoke name=\"(\w+)\">(.*?)</invoke>\s*</function_calls>", re.DOTALL)
PARAM_RE = re.compile(r'<parameter name="(\w+)">(.*?)</parameter>', re.DOTALL)

def extract_module_call(text: str):
    match = FUNCTION_CALL_RE.search(text)
    if match:
        module_name = match.group(1)
        params = {m.group(1): m.group(2) for m in PARAM_RE.finditer(match.group(2))}
        if len(params) == 1 and "input" in params:
            input_val = params["input"]
        else:
            input_val = json.dumps(params)
        return {"module": module_name, "input": input_val}
    return None
from utils.claude import call_claude, OPUS

TRACE_PATH = "data/trace.json"
FAILURE_STATE_PATH = "data/failure_state.json"


def save_state(messages):
    os.makedirs(os.path.dirname(FAILURE_STATE_PATH), exist_ok=True)
    with open(FAILURE_STATE_PATH, "w") as f:
        json.dump(messages, f)


def load_state():
    with open(FAILURE_STATE_PATH) as f:
        return json.load(f)


class FailureModule(Module):
    """Diagnoses and repairs failures by analyzing the execution trace and using file/bash tools to find and fix the root cause."""

    def __init__(self, registry=None):
        super().__init__(registry)
        self.messages = []

    def _loop(self) -> dict:
        # Defensive: ensure messages end with user before calling Claude
        if self.messages and self.messages[-1]["role"] == "assistant":
            self.messages.append({"role": "user", "content": "Continue your diagnosis."})

        while True:
            stream_label("Failure:", _RED)
            ls = LineStream(_WHITE)
            raw = call_claude(self.messages, model=OPUS, on_token=ls.token).strip()
            ls.flush()
            stream_end()
            self.messages.append({"role": "assistant", "content": raw})

            parsed = extract_module_call(raw)
            if parsed and "module" in parsed:
                save_state(self.messages)
                result = self.call(parsed["module"], parsed.get("input", ""))
                result["called_module"] = parsed["module"]
                return result

            if raw.lower() == "done":
                break

            self.messages.append({"role": "user", "content": "Continue your diagnosis."})

        return self.complete("Failure diagnosis complete.")

    def run(self, data) -> dict:
        error = data["input"]

        with open(TRACE_PATH) as f:
            trace = json.load(f)
        modules_json = json.dumps(self.registry, indent=2)
        system_prompt = load_system_prompt("failure.md", {"AVAILABLE_MODULES_JSON": modules_json})

        self.messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"A failure occurred:\n{error}\n\nExecution trace:\n{json.dumps(trace, indent=2)}"}
        ]

        print_error("\n[Failure module activated — diagnosing...]\n")
        return self._loop()

    def resume(self, result) -> dict:
        # Always reload messages from file to avoid stale state
        try:
            self.messages = load_state()
        except FileNotFoundError:
            pass

        called_module = result.get("called_module", "module")
        self.messages.append({"role": "user", "content": f"[{called_module} output]: {result['output']}"})
        return self._loop()
