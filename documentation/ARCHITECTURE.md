# Architecture

Zipper executes tools in a tree-shaped trace and resumes parent tools as children complete.

## Entry Points

- `zipper.py run()`: starts a new session and assistant root.
- `zipper.py restart_run()`: resumes an active incomplete trace after process restart.

## Core Runtime Objects

- Tool registry: `tools/__init__.py` (`TOOLS`, `TOOL_DESCRIPTIONS`)
- Base contract: `tools/tool.py` (`run`, optional `resume`)
- Main loop: `zipper.py::main_loop(...)`

## Main Loop Protocol

Each tool result must be one of:

- Tool call: `{"tool": "<name>", "input": ...}`
- Completion: `{"output": ...}`

Behavior:

1. Tool call creates a child trace node under current node.
2. Runtime instantiates target tool and invokes `run(...)`.
3. Completion writes `output` to current node.
4. Runtime pops stack and calls parent tool `resume(...)`.

If payload is invalid or a tool is missing, runtime routes to `failure`.

## Trace Model

Trace is stored as JSON tree at `data/sessions/<session_id>/trace.json`.

Node fields:

- `id`
- `tool`
- `input`
- `called` (child nodes)
- optional `output`
- optional conversation identifiers (`conversation_id`, `*_conversation_id`)

The runtime persists trace after each step.

## Restart Resume Model

`restart_run()`:

1. Loads current session and trace.
2. Finds deepest active path (nodes without `output`).
3. Marks deepest node (restart call) complete.
4. Rebuilds tool stack for ancestors.
5. Resumes parent tool with `{"output": "Process restarted successfully.", "called_tool": "restart"}` plus collected conversation IDs.

If no active path exists, it loads the latest assistant conversation ID (if available) and starts a fresh assistant root within the same session.
