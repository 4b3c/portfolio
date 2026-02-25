# Zipper

Zipper is a modular, tool-using AI runtime for software work.  
It runs a primary assistant that can call specialized modules (file ops, code edits, repo analysis, planning, reasoning, web search, HTTP, etc.), persist state, and resume after failures or restarts.

## Why Zipper

- **Modular by design**: capabilities are isolated into modules with clear contracts.
- **Traceable execution**: every module call is recorded in a session trace.
- **Resumable workflows**: conversation/state persistence enables restart and recovery.
- **Adaptive model usage**: difficulty-based model routing balances cost and capability.
- **Long-session support**: conversation compaction preserves direction while reducing tokens.

## How It Works (High Level)

1. `zipper.py` starts a session and launches the `assistant` module.
2. The assistant responds directly or emits one module call at a time.
3. The runtime executes that module, captures output, and resumes the caller.
4. The loop continues until completion, with trace/state saved throughout.
5. If errors occur, control can be routed to the `failure` module for diagnosis/recovery.

## Key Concepts

- **Modules**: pluggable units implementing `run(...)` (and optional `resume(...)`).
- **Function-call protocol**: XML-like single-call format for module invocations.
- **Session storage**: each run writes under `data/sessions/<session_id>/`:
  - `trace.json`
  - `conversations/`
  - `state/`
  - `versions/`
- **System prompts**: prompt files in `system_prompts/` define agent behavior.

## Built-In Capabilities

- `assistant`, `planner`, `reason`, `failure`, `restart`
- `file`, `code`, `repo`, `memory`
- `bash`, `http`, `search`, `summarize`

## Quick Start

1. Create/activate a virtual environment.
2. Install dependencies.
3. Set `ANTHROPIC_API_KEY` in `.env`.
4. Run:

```bash
python zipper.py
```

To resume after code changes:

```bash
python zipper.py restart
```

## Project Navigation

- Runtime entry: `zipper.py`
- Module implementations: `modules/`
- Shared utilities: `utils/`
- Prompts: `system_prompts/`
- Deep documentation: `documentation/`

## Documentation Map

See [documentation/README.md](/Users/abram/Desktop/Zipper/documentation/README.md) for focused docs on architecture, sessions, modules, prompts, and recovery behavior.
