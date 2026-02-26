# Zipper

Zipper is a modular, tool-driven AI runtime for software tasks.
It runs a primary assistant that can call specialized tools, persist state, recover from failures, and resume after restart.

## Why Zipper

- Modular tool architecture with a shared tool contract.
- Session-scoped persistence for trace, conversations, and tool state.
- Restart-and-resume flow for iterative coding loops.
- Model routing based on estimated task difficulty.
- Long-session support through automatic conversation compaction.

## Runtime Flow

1. `zipper.py` creates or resumes a session.
2. It starts `assistant` and enters the main loop.
3. A tool returns either:
   - `{"tool": "<name>", "input": ...}` to invoke another tool, or
   - `{"output": ...}` to complete and return to parent.
4. Trace is persisted after each step to `data/sessions/<session_id>/trace.json`.
5. On exceptions, runtime routes to `failure` unless already inside failure handling.

## Built-In Tools

- Conversational: `assistant`, `planner`, `reason`, `failure`
- Core: `bash`, `file`, `code`, `memory`, `tool_docs`, `restart`
- Coding: `repo`, `stats`
- Other: `search`, `http`, `summarize`

## Session Data Layout

Per session data is stored under `data/sessions/<session_id>/`:

- `trace.json`
- `conversations/`
- `state/`
- `versions/` (zip snapshots)

Global pointers/data:

- `data/current_session.json`
- `data/memory.json`
- `data/plans/`

## Quick Start

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Set `ANTHROPIC_API_KEY` in environment or `.env`.
4. Optional for web search tool: set `BRAVE_API_KEY`.
5. Run:

```bash
python zipper.py
```

To restart and resume active work after code changes:

```bash
python zipper.py restart
```

## Project Map

- Entry point: `zipper.py`
- Tool registry: `tools/__init__.py`
- Tool implementations: `tools/`
- Shared runtime utilities: `utils/`
- Prompts: `system_prompts/`
- Documentation: `documentation/`

## Documentation

See [documentation/README.md](/Users/abram/Desktop/Zipper/documentation/README.md) for focused docs on architecture, tools, sessions, prompts, and failure recovery.
