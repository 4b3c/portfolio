# Prompts and Routing

System prompts live in `system_prompts/` and are loaded via `utils/prompts.py`.

## Prompt Files

- `assistant.md`: main assistant behavior and call protocol.
- `assistant_classifier.md`: classifies user request difficulty (1-5).
- `assistant_compact.md`: compaction prompt for long assistant conversations.
- `planner_create.md`: planner workflow and output constraints.
- `reason.md`: deep reasoning workflow.
- `failure.md`: failure diagnosis workflow.
- `summarizer.md`: summarization behavior.
- `tool_docs_check.md`: tool suitability check for category queries.

## Prompt Injection

`load_system_prompt(filename, replacements)` supports token replacement.

Common replacement:

- `{{AVAILABLE_TOOLS_JSON}}`

`tool_docs` check mode prompt uses:

- `{{TOOL_DEFINITIONS_JSON}}`

## Assistant Difficulty Routing

`AssistantTool` classifies non-command user turns with Haiku classifier prompt.

Current mapping:

- difficulty 1-2 -> `claude-haiku-4-5`
- difficulty 3-4 -> `claude-sonnet-4-5`
- difficulty 5 -> `claude-opus-4-6`

Special cases forced to difficulty 1:

- empty input
- `done`
- slash commands (`/...`)

## Long-Session Compaction

Assistant auto-compaction thresholds are based on message count and total characters.

Compaction creates a branch conversation ID (for example `assistant3` -> `assistant3.1`) and keeps:

- original system prompt
- one synthetic user message with compacted canonical context

Compaction can be deferred when prompt output signals that all content remains important.
