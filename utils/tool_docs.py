import json
from typing import Any

CORE_TOOL_NAMES = {
    "bash",
    "file",
    "code",
    "memory",
    "tool_docs",
}

TOOL_DOCS = {
    "assistant": (
        "General-purpose conversational orchestrator.\n"
        "How it works: keeps a running conversation transcript, selects model depth based on task difficulty, and can call exactly one tool per turn.\n"
        "Input: plain-text user request in `input`.\n"
        "Use when: handling mixed user requests and deciding whether to answer directly or call another tool.\n"
        "Do not use when: you already know the exact specialized tool needed and should call it directly from a parent tool."
    ),
    "bash": (
        "Run a single shell command and return stdout/stderr.\n"
        "How it works: executes `input` with `subprocess.run(..., shell=True)` and a 30s timeout. Returns command output as text.\n"
        "Input: plain-text shell command in `input`.\n"
        "Use when: environment inspection, running tests, listing files, grepping, or other terminal actions.\n"
        "Do not use when: editing source files directly (use `code` for targeted edits or `file` for direct file I/O)."
    ),
    "file": (
        "Direct file-system operations (read, write, create, list).\n"
        "How it works: accepts structured fields and performs the requested file action; `read` may summarize very large files unless `full=true`.\n"
        "Input: structured fields: `action` in {list, read, new, write}, plus `path` and optional `content`/`full`.\n"
        "Use when: you need complete file contents, create new files, or overwrite files intentionally.\n"
        "Do not use when: you need a minimal surgical edit at one location (prefer `code`)."
    ),
    "code": (
        "Single-location, exact-match code edit tool.\n"
        "How it works: loads a file, requires exactly one match of `old`, replaces it with `new`, and fails on zero/multiple matches.\n"
        "Input: structured fields `path`, `old`, `new` (whitespace-sensitive).\n"
        "Use when: applying a precise, reviewable patch at one known location.\n"
        "Do not use when: you need broad rewrites across many locations or when exact source text is unknown."
    ),
    "memory": (
        "Persistent key-value storage shared across sessions.\n"
        "How it works: reads/writes `data/memory.json` with actions `get`, `set`, `delete`, `list`.\n"
        "Input: structured fields with `action` and related `key`/`value`.\n"
        "Use when: storing stable preferences, IDs, or durable facts needed later.\n"
        "Do not use when: storing large documents or temporary scratch data better kept in normal conversation context."
    ),
    "planner": (
        "Creates actionable engineering plans and can gather context first.\n"
        "How it works: runs an OPUS planning loop, can call tools to collect facts, writes `data/plans/<name>/PLAN.md`, then waits for user input.\n"
        "Input: structured fields with `action` in {create, list, view, update}; `create` requires `objective`.\n"
        "Use when: the task is large/ambiguous and benefits from a written multi-step plan.\n"
        "Do not use when: a direct implementation is straightforward and no plan artifact is needed."
    ),
    "repo": (
        "Codebase intelligence for search, symbols, dependencies, impact, and docs lookup.\n"
        "How it works: scans source files and project docs, returning structured JSON for actions like `find`, `symbols`, `deps`, `impact`, `docs_*`.\n"
        "Input: structured fields with `action` and action-specific parameters.\n"
        "Use when: you need fast project-wide discovery before touching files.\n"
        "Do not use when: you already know the exact file/section and can read it directly with `file`."
    ),
    "stats": (
        "Generates a project statistics report.\n"
        "How it works: walks code files, computes line/function/language metrics, attempts git stats, and returns markdown report text.\n"
        "Input: none required (`input` ignored).\n"
        "Use when: you need high-level codebase metrics or summary reporting.\n"
        "Do not use when: you need targeted debugging, specific symbol lookup, or edits."
    ),
    "summarize": (
        "Condenses long text into a concise summary using the summarizer prompt.\n"
        "How it works: sends text to a model with summary instructions and returns the condensed result.\n"
        "Input: plain text in `input`.\n"
        "Use when: output is too long to process directly and you need a compact digest.\n"
        "Do not use when: exact wording, code blocks, or full fidelity is required."
    ),
    "search": (
        "Web search via Brave Search API.\n"
        "How it works: queries Brave with API key from `BRAVE_API_KEY` and returns top formatted results.\n"
        "Input: plain query text or structured `{query, limit}`.\n"
        "Use when: you need external/current information not available in local files.\n"
        "Do not use when: local repo data is sufficient or credentials/network are unavailable."
    ),
    "reason": (
        "High-depth reasoning loop with optional tool calls.\n"
        "How it works: runs OPUS in a persisted conversation, can call one tool per turn, then returns either an answer or a tool call.\n"
        "Input: plain-text question/task in `input`.\n"
        "Use when: a problem is complex, multi-step, or requires careful analysis before action.\n"
        "Do not use when: the task is simple and can be solved directly or with one obvious tool call."
    ),
    "failure": (
        "Failure diagnosis and recovery agent.\n"
        "How it works: reads session trace, runs an OPUS diagnostic loop, and can call tools to isolate/fix root causes.\n"
        "Input: plain-text failure description in `input`; can be auto-triggered by runtime errors.\n"
        "Use when: runtime/tool execution failed and root-cause analysis is needed.\n"
        "Do not use when: no failure occurred and normal task flow is working."
    ),
    "restart": (
        "Restarts the Zipper process to load updated code.\n"
        "How it works: waits briefly then `execv`s `python zipper.py restart`, preserving session recovery flow.\n"
        "Input: none required (`input` ignored).\n"
        "Use when: source/runtime internals changed and process reload is required.\n"
        "Do not use when: only normal tool outputs changed and no restart is needed."
    ),
    "http": (
        "HTTP client for API interaction.\n"
        "How it works: performs requests with configurable method/url/headers/body/params/auth/timeout and returns structured response JSON.\n"
        "Input: structured fields including required `method` and `url`.\n"
        "Use when: calling external APIs or endpoints directly.\n"
        "Do not use when: a shell command or dedicated search tool is a simpler fit."
    ),
    "tool_docs": (
        "Returns the detailed usage docstring for a named tool.\n"
        "How it works: looks up tool metadata and returns description, input contract, usage guidance, and anti-patterns.\n"
        "Input: plain tool name in `input` (for example `repo`) or structured with `name`/`tool`.\n"
        "Use when: you want to call a non-core tool and need its exact contract first.\n"
        "Do not use when: the target is a core tool already documented in the system prompt."
    ),
}


def get_tool_doc(name: str, fallback: str | None = None) -> str:
    doc = TOOL_DOCS.get(name)
    if doc:
        return doc
    return (fallback or "").strip() or "No documentation available."


def parse_tool_name_from_input(raw_input: Any) -> str:
    if isinstance(raw_input, dict):
        for key in ("name", "tool", "tool_name", "input"):
            value = raw_input.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return ""
    text = str(raw_input or "").strip()
    if not text:
        return ""
    if text.startswith("{"):
        try:
            payload = json.loads(text)
            return parse_tool_name_from_input(payload)
        except Exception:
            return text
    return text


def build_prompt_tool_context(registry: dict[str, str], *, exclude: set[str] | None = None) -> str:
    exclude = exclude or set()
    names = sorted(name for name in registry.keys() if name not in exclude)
    core_docs = {name: get_tool_doc(name, registry.get(name)) for name in names if name in CORE_TOOL_NAMES}
    other_names = [name for name in names if name not in CORE_TOOL_NAMES]
    payload = {
        "core_tools_with_docstrings": core_docs,
        "other_tools_name_only": other_names,
    }
    return json.dumps(payload, indent=2)


def enforce_tool_docs_requirement(
    tool_result: dict,
    *,
    registry: dict[str, str],
    documented_tools: set[str],
) -> dict | None:
    tool_name = str(tool_result.get("tool") or "").strip()
    if not tool_name:
        return {
            "_continue_loop": True,
            "user_message": "Invalid tool call: missing tool name.",
        }

    if tool_name == "tool_docs":
        target_name = parse_tool_name_from_input(tool_result.get("input"))
        if target_name in registry:
            documented_tools.add(target_name)
            return None
        return {
            "_continue_loop": True,
            "user_message": (
                "Call tool_docs with a valid tool name from the available list "
                "before trying non-core tools."
            ),
        }

    if tool_name in CORE_TOOL_NAMES:
        return None

    if tool_name not in documented_tools:
        return {
            "_continue_loop": True,
            "user_message": (
                f"Before calling '{tool_name}', call tool_docs with input '{tool_name}' "
                "and then retry with correct parameters."
            ),
        }

    return None
