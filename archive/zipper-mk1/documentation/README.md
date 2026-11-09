# Documentation Index

This folder documents the current Zipper runtime behavior.

## Core Docs

- [ARCHITECTURE.md](/Users/abram/Desktop/Zipper/documentation/ARCHITECTURE.md): runtime loop, trace model, restart resume path.
- [TOOLS_REFERENCE.md](/Users/abram/Desktop/Zipper/documentation/TOOLS_REFERENCE.md): tool registry and input/output contracts.
- [SESSION_STORAGE.md](/Users/abram/Desktop/Zipper/documentation/SESSION_STORAGE.md): session layout, snapshots, and persistence files.
- [CONVERSATION_AND_STREAMING.md](/Users/abram/Desktop/Zipper/documentation/CONVERSATION_AND_STREAMING.md): conversation runtime, function-call parsing, pauses.
- [PROMPTS_AND_ROUTING.md](/Users/abram/Desktop/Zipper/documentation/PROMPTS_AND_ROUTING.md): system prompts and assistant model routing.
- [FAILURE_AND_RECOVERY.md](/Users/abram/Desktop/Zipper/documentation/FAILURE_AND_RECOVERY.md): failure tool and restart behavior.
- [TOOL_BUILDING.md](/Users/abram/Desktop/Zipper/documentation/TOOL_BUILDING.md): how to add and register new tools.

## Scope Notes

- Docs reflect code in `zipper.py`, `tools/`, and `utils/`.
- Session examples assume default data root `data/`.
