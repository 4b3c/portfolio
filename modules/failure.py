import json
import os
import re
from modules.module import Module

CODE_FENCE_RE = re.compile(r"```(?:\w+)?\s*(\{.*?\})\s*```", re.DOTALL)

def extract_module_call(text: str):
    for match in CODE_FENCE_RE.finditer(text):
        try:
            parsed = json.loads(match.group(1))
            if "module" in parsed:
                return parsed
        except json.JSONDecodeError:
            continue
    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        try:
            parsed = json.loads(stripped)
            if "module" in parsed:
                return parsed
        except json.JSONDecodeError:
            pass
    return None
from utils.claude import call_claude, OPUS

TRACE_PATH = "data/trace.json"
FAILURE_STATE_PATH = "data/failure_state.json"

SYSTEM_PROMPT = """
You are a diagnostic agent for Zipper, a modular AI assistant framework.

Zipper works by routing user input through a stack of modules. Each module can call other modules, and results are passed back up the stack. The execution is recorded as a trace tree.

The source files are in the current working directory. Use `pwd` and `ls` to orient yourself, then read files with the file module using relative paths.

The modules are:
- assistant: conversational AI that handles user interaction and routes to other modules
- bash: runs shell commands
- file: reads, writes, and lists files (input: JSON with action/path/content, or empty to list all files)
- memory: persistent key-value store
- summarize: summarizes long text
- search: web search via Brave
- reason: deep reasoning using a powerful model
- failure: (this module) diagnoses and fixes errors

Your job is to:
1. Analyze the provided execution trace to identify where and why things went wrong
2. Use file and bash to read relevant source files in the current directory
3. Identify the root cause of the failure
4. Fix the problem by writing corrected files

To call a tool, wrap a JSON object in a code fence:

```json
{"module": "<module_name>", "input": "<input>"}
```

When you are done and the issue is resolved, respond with only the word "done".
"""


def save_state(messages):
    os.makedirs(os.path.dirname(FAILURE_STATE_PATH), exist_ok=True)
    with open(FAILURE_STATE_PATH, "w") as f:
        json.dump(messages, f)


def load_state():
    with open(FAILURE_STATE_PATH) as f:
        return json.load(f)


class FailureModule(Module):
    """Diagnoses and repairs failures by analyzing the execution trace and using file/bash tools to find and fix the root cause."""

    def __init__(self, context_path):
        super().__init__(context_path)
        self.messages = []

    def _loop(self) -> dict:
        # Defensive: ensure messages end with user before calling Claude
        if self.messages and self.messages[-1]["role"] == "assistant":
            self.messages.append({"role": "user", "content": "Continue your diagnosis."})

        while True:
            raw = call_claude(self.messages, model=OPUS).strip()
            self.messages.append({"role": "assistant", "content": raw})

            parsed = extract_module_call(raw)
            if parsed and "module" in parsed:
                save_state(self.messages)
                result = self.call(parsed["module"], parsed.get("input", ""))
                result["called_module"] = parsed["module"]
                return result

            print(f"Failure: {raw}\n")
            if raw.lower() == "done":
                break

        return self.complete("Failure diagnosis complete.")

    def run(self, data) -> dict:
        error = data["input"]

        with open(TRACE_PATH) as f:
            trace = json.load(f)

        self.messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"A failure occurred:\n{error}\n\nExecution trace:\n{json.dumps(trace, indent=2)}"}
        ]

        print("\n[Failure module activated — diagnosing...]\n")
        return self._loop()

    def resume(self, result) -> dict:
        # Always reload messages from file to avoid stale state
        try:
            self.messages = load_state()
        except FileNotFoundError:
            pass

        called_module = result.get("called_module", "module")
        self.messages.append({"role": "user", "content": f"[{called_module} output]: {result['output']}"})
        print(f"{called_module}: {result['output']}\n")
        return self._loop()
