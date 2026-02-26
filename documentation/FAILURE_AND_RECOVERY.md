# Failure and Recovery

Failure handling is designed to keep the runtime alive and resumable.

## Failure Tool

`tools/failure.py` runs an OPUS-guided diagnosis loop and can call other tools.

It persists:

- conversation transcript (`conversations/failure*.json`)
- resume state (`state/failure_state.json`)

## Main Loop Error Routing

`zipper.py` catches runtime exceptions in `main_loop(...)` and routes to:

- `{"tool": "failure", "input": "<error>"}`.

If failure itself errors repeatedly, runtime writes an error output and exits the loop safely.

## Restart Flow

`restart` tool performs `os.execv(...)` and process restarts with `zipper.py restart`.

`restart_run()`:

1. Loads active session trace.
2. Finds deepest active path.
3. Marks restart node complete.
4. Rebuilds tool stack.
5. Resumes parent tool with restart output.

Conversation IDs on the active path are rehydrated into resume payload so tools can reload the correct transcript.

## Rate Limit Pause Behavior

`utils/claude.py` raises a pause signal for Anthropic rate-limit/overload errors.

Assistant behavior:

- prints a pause message
- waits for user input before continuing

Reason/planner/failure behavior:

- return `WAIT_FOR_USER_INPUT` payload to assistant
- assistant pauses and waits for user direction
