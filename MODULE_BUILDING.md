# Building A New Module

This guide is for adding a module to this Zipper codebase.

## 1) Create the module file

Add `modules/<name>.py`.

Minimum shape:

```python
import json
from modules.module import Module

class ExampleModule(Module):
    """One-line docstring used by assistant/reason/planner as capability text."""

    def run(self, data) -> dict:
        # data["input"] is the module input from function call
        return self.complete("done")
```

Notes:
- Inherit from `Module`.
- Return `self.complete(...)` for success or `self.fail(...)` for errors.
- Use JSON input if structured args are needed.

## 2) Register it

Edit [modules/registry.py](/Users/abram/Desktop/Zipper/modules/registry.py):
- Import your class.
- Add it to `MODULES` with key `<name>`.

`MODULE_DESCRIPTIONS` is auto-derived from module docstrings.

## 3) Add/adjust prompts (if needed)

System prompts live in `system_prompts/`.

If your module needs new behavior instructions:
- Update relevant prompt files (usually `assistant.md`, optionally `reason.md`, `planner_create.md`, `failure.md`).
- Keep the rule: one module invocation per response.

## 4) If the module calls other modules

If your module is agent-like (multi-turn):
- Use `utils.function_calls.maybe_dispatch_module_call(...)`.
- Implement `resume(self, result)` to continue after child module returns.
- Persist state per message if the module is long-running (pattern used by `planner` and `reason`).

## 5) If the module uses LLM prompts

- Store system prompts in `system_prompts/*.md`.
- Load with `utils.prompts.load_system_prompt(...)`.
- Do not hardcode large system strings in module files.

## 6) Logging and persistence conventions

For nested agent modules:
- Save message logs to `data/conversations/<module>_<id>.json` on each message append.
- Save resumable state to `data/<module>_state.json`.
- Return `<module>_conversation_id` in module-call results so trace nodes preserve linkage.

## 7) Validate

Run:

```bash
python -m py_compile zipper.py modules/*.py utils/*.py
```

Then run `python zipper.py` and test:
- direct call path
- module-call path (if any)
- resume path (if any)
- failure handling

## 8) Quality checklist

- Clear docstring capability description.
- Deterministic input parsing + validation errors.
- No broad file crawling unless explicitly required.
- Bounded loops / call budgets for agent-like modules.
- Emits actionable outputs (not vague summaries).
