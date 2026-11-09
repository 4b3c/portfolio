# Tools Reference

Tool registry is defined in `tools/__init__.py`.

## Conversational Tools

- `assistant`: primary interactive user loop, model routing, command handling, tool dispatch.
- `planner`: create/list/view/update plans under `data/plans/` with persisted planner context.
- `reason`: OPUS reasoning loop that can call tools before answering.
- `failure`: OPUS diagnosis/recovery loop for runtime failures.

## Core Tools

- `bash`: run shell command (`input` plain text, 30s timeout).
- `file`: list/read/new/write file operations.
- `code`: single-location exact search/replace edit (`path`, `old`, `new`).
- `memory`: persistent key-value store (`get`, `set`, `delete`, `list`).
- `tool_docs`: tool doc lookup/check mode for tool selection guardrails.
- `restart`: process restart via `os.execv` and `zipper.py restart`.

## Coding Tools

- `repo`: code intelligence and documentation helpers.
  - `find`, `symbols`, `deps`, `impact`
  - `docs_list`, `docs_read`, `docs_find`
- `stats`: markdown code statistics report (also saved to `state/stats.md`).

## Other Tools

- `search`: Brave Search API query (`BRAVE_API_KEY` required).
- `http`: HTTP client tool with structured request/response payload.
- `summarize`: summarize long text using summarizer prompt.

## Tool Input/Output Contract

Base helpers live in `tools/tool.py`.

Input conventions:

- text tools read `data["input"]` via `input_text(...)`
- structured tools parse `data["input"]` via `input_json(...)`

Output conventions:

- call another tool: `{"tool": "<name>", "input": ...}`
- return result: `{"output": ...}`

## Tool-Docs Enforcement

`assistant`, `planner`, `reason`, and `failure` enforce non-core tool documentation requirements via `enforce_tool_docs_requirement(...)`:

- Core tools (`bash`, `file`, `code`, `memory`, `tool_docs`, `restart`) can be called directly.
- Non-core tools require a prior `tool_docs` lookup for that tool.
- Category/comparison requests are expected to use `tool_docs` check mode.
