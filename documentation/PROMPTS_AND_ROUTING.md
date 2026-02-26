# Prompts and Routing

System prompts are stored in `system_prompts/`.

## Prompt Files

- `assistant.md`: Main assistant behavior and tool-call protocol.
- `assistant_classifier.md`: Difficulty classifier for model selection.
- `assistant_compact.md`: Conversation compaction format.
- `planner_create.md`: Planner constraints and plan output format.
- `reason.md`: Reasoning behavior and tool usage.
- `failure.md`: Failure diagnosis behavior.
- `summarizer.md`: Summary behavior.

## Difficulty and Model Selection

Assistant classifies each real user input into a 1-5 difficulty level.

Current mapping:

- 1-2: Haiku
- 3-4: Sonnet
- 5: Opus

Keyword/command-style inputs (for example `done` or `/...`) bypass complex routing.

## Prompt Loading

`utils/prompts.py` loads prompt files and applies replacement tokens like:

- `{{AVAILABLE_TOOLS_JSON}}`

The runtime injects current tool descriptions into prompts at load time.
