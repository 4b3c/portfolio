# Building a New Tool

This guide reflects the current Zipper tool contract and runtime behavior.

## 1) Create Tool File

Add a module under an existing category:

- `tools/core/`
- `tools/coding/`
- `tools/conversational/`
- `tools/other/`

Minimum shape:

```python
from tools.tool import Tool

class ExampleTool(Tool):
    """Short capability description used in tool docs."""

    def run(self, data) -> dict:
        text = self.input_text(data)
        return self.complete(f"ok: {text}")
```

## 2) Parse Input Correctly

Use base helpers:

- `self.input_text(data)` for plain text
- `self.input_json(data, fallback=...)` for structured payloads

On invalid input, return `self.fail("...")` with a specific error.

## 3) Return Valid Runtime Payloads

Tool outputs must be one of:

- `self.complete(value)` -> `{"output": value}`
- `self.call("other_tool", value)` -> `{"tool": "other_tool", "input": ...}`

For multi-turn tools, implement `resume(self, result)`.

## 4) Register the Tool

Edit [tools/__init__.py](/Users/abram/Desktop/Zipper/tools/__init__.py):

- import class
- add to `TOOLS` dict

`TOOL_DESCRIPTIONS` is derived from class docstrings automatically.

## 5) Add Prompting (If Needed)

If tool is LLM-driven, add/update relevant `system_prompts/*.md` and load with:

- `load_system_prompt(...)`

Keep one-tool-call-per-response behavior in prompt instructions.

## 6) Persist State for Long-Running Tools

Patterns used by conversational tools:

- transcript via `ConversationStore("kind")`
- resumable state JSON in `state/<tool>_state.json`

Include conversation IDs in tool-call payloads when parent resume needs them.

## 7) Validate

Run a compile check:

```bash
python -m py_compile zipper.py tools/*.py utils/*.py
```

Then run runtime smoke tests:

- direct run path
- nested tool-call path
- resume path (if implemented)
- restart path (if relevant)
- failure routing behavior

## 8) Quality Checklist

- Clear docstring explaining capability and input contract.
- Deterministic input validation and explicit errors.
- Bounded loops/timeouts for autonomous tools.
- No unnecessary broad file traversal.
- Output is actionable and compatible with runtime protocol.
