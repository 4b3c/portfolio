import json
import os
from modules.module import Module
from utils.claude import OPUS
from utils.colors import print_error, _RED
from utils.conversation import stream_response
from utils.function_calls import contains_function_call_markup, maybe_dispatch_module_call
from utils.prompts import load_system_prompt
from utils.session import state_path, trace_path

def save_state(messages):
    path = state_path("failure_state.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(messages, f)


def load_state():
    with open(state_path("failure_state.json")) as f:
        return json.load(f)


class FailureModule(Module):
    """Diagnose runtime failures from the active session trace and recover via module calls.

    Runs an OPUS-guided loop with persisted conversation/state under the current
    session so diagnosis can resume after nested module calls or restarts.
    """

    def __init__(self, registry=None):
        super().__init__(registry)
        self.messages = []

    def _loop(self) -> dict:
        # Defensive: ensure messages end with user before calling Claude
        if self.messages and self.messages[-1]["role"] == "assistant":
            self.messages.append({"role": "user", "content": "Continue your diagnosis."})

        while True:
            raw = stream_response(self.messages, OPUS, "Failure:", _RED, hide_fn_calls=True)
            self.messages.append({"role": "assistant", "content": raw})

            module_result = maybe_dispatch_module_call(self, raw, include_called_module=True)
            if module_result:
                save_state(self.messages)
                return module_result
            if contains_function_call_markup(raw):
                print_error(
                    "Malformed function call:",
                    "Ignored XML call markup because it was not a single valid top-level call.",
                )

            if raw.lower() == "done":
                break

            self.messages.append({"role": "user", "content": "Continue your diagnosis."})

        return self.complete("Failure diagnosis complete.")

    def run(self, data) -> dict:
        error = data["input"]

        with open(trace_path()) as f:
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
