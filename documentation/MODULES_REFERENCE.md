# Modules Reference

Current module registry is defined in `modules/registry.py`.

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

## Utility Modules

- `memory`: Persistent key-value memory.
- `summarize`: Condenses long text.

## Module Contract

All modules inherit from `Module` and implement:

- `run(data) -> dict`
- optional `resume(result) -> dict`

Module results must return either:

- `{"module": "...", "input": ...}` to call another module
- `{"output": ...}` to complete
