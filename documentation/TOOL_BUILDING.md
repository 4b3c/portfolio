# Building A New Tool

This guide is for adding a tool to this Zipper codebase.

## 1) Create the tool file

Add `tools/<name>.py`.

Minimum shape:

```python
import json
from tools.tool import Tool

class ExampleModule(Tool):
    """One-line docstring used by assistant/reason/planner as capability text."""

    def run(self, data) -> dict:
        # data["input"] is the tool input from function call
        return self.complete("done")
```

Notes:
- Inherit from `Tool`.
- Return `self.complete(...)` for success or `self.fail(...)` for errors.
- Use JSON input if structured args are needed.

## 2) Register it

Edit [tools/__init__.py](/Users/abram/Desktop/Zipper/tools/__init__.py):
- Import your class.
- Add it to `TOOLS` with key `<name>`.

`TOOL_DESCRIPTIONS` is auto-derived from tool docstrings.

## 3) Add/adjust prompts (if needed)

System prompts live in `system_prompts/`.

If your tool needs new behavior instructions:
- Update relevant prompt files (usually `assistant.md`, optionally `reason.md`, `planner_create.md`, `failure.md`).
- Keep the rule: one tool invocation per response.

## 4) If the tool calls other tools

If your tool is agent-like (multi-turn):
- Use `utils.function_calls.maybe_dispatch_tool_call(...)`.
- Implement `resume(self, result)` to continue after child tool returns.
- Persist state per message if the tool is long-running (pattern used by `planner` and `reason`).

## 5) If the tool uses LLM prompts

- Store system prompts in `system_prompts/*.md`.
- Load with `utils.prompts.load_system_prompt(...)`.
- Do not hardcode large system strings in tool files.

## 6) Logging and persistence conventions

For nested agent tools:
- Save message logs to `data/sessions/<session_id>/conversations/<tool><n>[.<m>].json` on each message append.
- Save resumable state to `data/sessions/<session_id>/state/<tool>_state.json`.
- Return `<tool>_conversation_id` in tool-call results so trace nodes preserve linkage.

## 7) Validate

Run:

```bash
python -m py_compile zipper.py tools/*.py utils/*.py
```

Then run `python zipper.py` and test:
- direct call path
- tool-call path (if any)
- resume path (if any)
- failure handling

## 8) Quality checklist

- Clear docstring capability description.
- Deterministic input parsing + validation errors.
- No broad file crawling unless explicitly required.
- Bounded loops / call budgets for agent-like tools.
- Emits actionable outputs (not vague summaries).
