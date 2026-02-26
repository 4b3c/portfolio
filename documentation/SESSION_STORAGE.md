# Session Storage

Zipper stores runtime data by session under `data/sessions/<session_id>/`.

## Layout

- `trace.json`: Full execution tree for the session.
- `conversations/`: Agent conversation logs (`assistant*`, `planner*`, `reason*`, `failure*`).
- `state/`: Per-tool resume state files.
- `versions/`: Zip snapshots created on start and restart.

Global helper file:

- `data/current_session.json`: active session ID.

## Conversation Naming

Conversation IDs are tool-prefixed:

- `assistant1`, `assistant1.1`, ...
- `planner1`, `planner1.1`, ...
- `reason1`, ...
- `failure1`, ...

Suffixes like `.1`, `.2` are compacted branches.

## Snapshots

On `run()` and `restart_run()`, Zipper creates a snapshot zip in:

- `data/sessions/<session_id>/versions/`

This captures project state for rollback/debugging context while excluding heavy runtime folders.
