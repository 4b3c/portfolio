# Conversation and Streaming

This document covers how assistant-like tools run model loops and call tools.

## Conversation Stores

`utils/conversation.py` provides `ConversationStore(kind)` to:

- list IDs for a tool kind
- choose next root and branch IDs
- save/load transcript files in the current session

Tools using conversation stores:

- `assistant`
- `planner`
- `reason`
- `failure`

## Tool Calls

Tool invocation uses XML blocks:

```xml
<function_calls>
<invoke name="tool_name">
<parameter name="param">value</parameter>
</invoke>
</function_calls>
```

Parsing and dispatch is centralized in `utils/function_calls.py`.

## Streaming Behavior

`utils/colors.LineStream` handles token streaming and terminal formatting.

Important behavior:

- Function call XML can be hidden from terminal output.
- Streaming stops after the first completed function call block.
- Malformed XML remains visible as an error path.

`utils/claude.call_claude(...)` returns text truncated to the first valid completed call when present.

## Auto Compaction

Assistant compacts long conversations using `assistant_compact.md`.

Compaction:

1. Summarizes relevant context.
2. Drops stale/off-track details.
3. Creates a new branch conversation ID.
4. Continues from compacted context.
