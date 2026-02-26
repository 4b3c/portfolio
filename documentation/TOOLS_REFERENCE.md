# Tools Reference

Current tool registry is defined in `tools/__init__.py`.

## Core Orchestration

- `assistant`: Primary user-facing agent loop.
- `planner`: Creates and updates implementation plans.
- `reason`: Deep reasoning loop before action.
- `failure`: Diagnoses and recovers from runtime failures.
- `restart`: Restarts process and resumes active trace.

## File and Code Operations

- `file`: List/read/new/write file operations.
- `code`: Targeted single-location search/replace edits.
- `repo`: Code intelligence (`find`, `symbols`, `deps`, `impact`, docs actions).

## Execution and External Access

- `bash`: Shell command execution with timeout.
- `http`: HTTP requests with structured response payload.
- `search`: Web search utility.

## Utility Tools

- `memory`: Persistent key-value memory.
- `summarize`: Condenses long text.
- `tool_docs`: Tool documentation and suitability checks.
  - lookup mode input: `{"mode":"lookup","tool":"repo"}`
  - check mode input: `{"mode":"check","query":"what tools for coding"}`

## Tool Contract

All tools inherit from `Tool` and implement:

- `run(data) -> dict`
- optional `resume(result) -> dict`

### Standard Input Format

- Runtime always passes tool input through `data["input"]`.
- Tools should read input using base helpers in `tools/tool.py`:
  - `input_text(data)` for plain string inputs.
  - `input_json(data, fallback=...)` for structured inputs.
- Function-call XML parameters are converted to a JSON string before tool execution.

Tool results must return either:

- `{"tool": "...", "input": ...}` to call another tool
- `{"output": ...}` to complete
