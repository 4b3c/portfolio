# Architecture

Zipper is a modular runtime that executes agent tools in a tree-shaped trace.

## Core Runtime

- Entry point: `zipper.py`
- Tool registry: `tools/__init__.py`
- Base tool contract: `tools/tool.py`

`zipper.py` runs a loop with two result shapes:

- Tool call: `{"tool": "<name>", "input": ...}`
- Completion: `{"output": ...}`

When a tool call is returned:

1. A child trace node is created under the current node.
2. The target tool is instantiated from the registry.
3. The tool `run(...)` method is invoked.

When output is returned:

1. Output is written to the current trace node.
2. Control returns to the parent tool via `resume(...)`.

If an exception occurs, runtime routes to the `failure` tool unless already in failure handling.

## Trace Model

Each trace node includes:

- `id`
- `tool`
- `input`
- `called` (children)
- optional conversation IDs (for tool-scoped transcripts)
- optional `output`

Trace is persisted under the current session after each step.
