# Architecture

Zipper is a modular runtime that executes agent modules in a tree-shaped trace.

## Core Runtime

- Entry point: `zipper.py`
- Module registry: `modules/registry.py`
- Base module contract: `modules/module.py`

`zipper.py` runs a loop with two result shapes:

- Module call: `{"module": "<name>", "input": ...}`
- Completion: `{"output": ...}`

When a module call is returned:

1. A child trace node is created under the current node.
2. The target module is instantiated from the registry.
3. The module `run(...)` method is invoked.

When output is returned:

1. Output is written to the current trace node.
2. Control returns to the parent module via `resume(...)`.

If an exception occurs, runtime routes to the `failure` module unless already in failure handling.

## Trace Model

Each trace node includes:

- `id`
- `module`
- `input`
- `called` (children)
- optional conversation IDs (for module-scoped transcripts)
- optional `output`

Trace is persisted under the current session after each step.
