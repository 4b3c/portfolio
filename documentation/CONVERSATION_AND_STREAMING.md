# Conversation and Streaming

Zipper uses a shared conversation runtime for assistant-like tools.

## Conversation Storage

`utils/conversation.py::ConversationStore(kind)` manages IDs and files under:

- `data/sessions/<session_id>/conversations/<conversation_id>.json`

Conversation IDs are tool-prefixed (for example `assistant1`, `planner2.1`).

Tools using conversation stores:

- `assistant`
- `planner`
- `reason`
- `failure`

## Shared Runtime

`ConversationRuntime` provides:

- `run_turn(...)`: one streamed model turn + optional tool dispatch.
- `run_interactive_loop(...)`: assistant-style user-interactive loop.
- `run_autonomous_loop(...)`: planner/reason/failure autonomous loops.

## Function-Call Parsing

Function calls are XML blocks parsed by `utils/function_calls.py`.

Rules enforced by parser/runtime:

- Exactly one top-level `<invoke ...>` inside `<function_calls>`.
- Block must be final non-whitespace content.
- Malformed call markup is ignored as a tool call (and surfaced in terminal).
- Only first completed function-call block is kept when returned by model output.

## Streaming Behavior

`utils/colors.LineStream` handles token streaming.

- Function-call XML can be hidden while streaming.
- Streaming may stop after first completed call block.
- ESC interrupt support is provided by `InterruptibleStream`.

## Pause/Wait Signals

Conversation runtime returns structured wait payloads when:

- Anthropic rate limit/overload occurs.
- User interrupts streaming with ESC.

Format includes:

- `signal: "WAIT_FOR_USER_INPUT"`
- `wait_for_user_input: true`
- message text and optional conversation key/id

Assistant resume behavior:

- If user replies with continue-style input (`continue`, `resume`, etc.) and payload indicates rate limit, assistant resumes the paused module with `_resume` and preserved conversation IDs.
- Otherwise assistant treats user input as a normal new turn.
