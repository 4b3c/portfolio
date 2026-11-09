# Session Storage

Session data is rooted at `data/sessions/<session_id>/`.

## Session Layout

- `trace.json`: execution tree for the runtime loop.
- `conversations/`: per-tool transcripts (`assistant*`, `planner*`, `reason*`, `failure*`).
- `state/`: resumable tool state (`planner_state.json`, `reason_state.json`, `failure_state.json`, `stats.md`, etc.).
- `versions/`: zip snapshots created at start/restart.

Global files:

- `data/current_session.json`: active session pointer.
- `data/memory.json`: cross-session key-value memory store.

## Conversation IDs

`ConversationStore` naming pattern:

- roots: `<kind><n>` (for example `assistant1`)
- branches: `<kind><n>.<m>` (for example `assistant1.2`)

Branch IDs are used by assistant compaction and can also appear in resumed flows.

## Snapshot Behavior

`create_session_version_snapshot(reason, session_id)` creates zip archives under:

- `data/sessions/<session_id>/versions/<timestamp>_<reason>.zip`

Snapshot excludes heavy/runtime directories including `.venv`, `node_modules`, hidden directories, and `data/sessions` to avoid recursive archive growth.
