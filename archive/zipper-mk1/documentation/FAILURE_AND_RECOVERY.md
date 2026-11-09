# Failure and Recovery

Zipper has two recovery paths: runtime exception routing and explicit process restart.

## Failure Tool

Implementation: `tools/conversational/failure.py`

Behavior:

- Runs an OPUS autonomous diagnosis loop.
- Includes current trace JSON in initial user context.
- Persists state to `state/failure_state.json`.
- Persists transcript to `conversations/failure*.json`.
- Can be invoked automatically (`manual=False`) or manually (`manual=True`).

## Runtime Exception Routing

`zipper.py::main_loop(...)` wraps each step in try/except.

On exception:

- Routes to `{"tool": "failure", "input": "Main loop exception: ...", "manual": False}`.
- If already in failure handling and another exception occurs, runtime writes error output on current node and exits loop to avoid recursion.

## Restart Tool and Resume

`tools/core/restart.py` calls `os.execv(...)` to replace the running process with:

- `python zipper.py restart`

`restart_run()` then resumes the active trace path instead of starting from scratch.

## Wait-For-User Control Signals

`reason`, `planner`, and `failure` can return wait payload JSON via conversation runtime.

Assistant detects these payloads in `resume(...)` and pauses for user input before deciding whether to:

- resume paused tool (`_resume` path), or
- continue normal assistant conversation.
