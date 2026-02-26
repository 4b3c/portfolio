import json
from typing import Any

from tools.tool import Tool
from utils.claude import HAIKU, call_claude
from utils.prompts import load_system_prompt

CORE_TOOL_NAMES = {
    "bash",
    "file",
    "code",
    "memory",
    "tool_docs",
    "restart"
}


def _clean_doc(doc: str | None) -> str:
    return (doc or "").strip() or "No documentation available."


def _is_core_tool_name(name: str) -> bool:
    return name in CORE_TOOL_NAMES


def _parse_tool_docs_request(raw_input: Any) -> tuple[str, str, str, str]:
    """Return (mode, tool_name, query, error_message)."""
    payload = raw_input
    if isinstance(payload, str):
        text = payload.strip()
        if not text:
            return ("", "", "", "tool_docs requires structured input with a mode.")
        if text.startswith("{"):
            try:
                payload = json.loads(text)
            except Exception:
                return ("", "", "", "tool_docs input JSON is invalid.")
        else:
            return ("", "", "", "tool_docs requires structured input, not plain text.")

    if isinstance(payload, dict):
        mode = str(payload.get("mode", "")).strip().lower()
        tool = str(payload.get("tool", "")).strip()
        query = str(payload.get("query", "")).strip()
        if mode not in {"lookup", "check"}:
            return ("", "", "", "tool_docs mode must be 'lookup' or 'check'.")
        if mode == "lookup":
            if not tool:
                return ("", "", "", "tool_docs lookup mode requires a non-empty 'tool'.")
            return ("lookup", tool, "", "")
        if not query:
            return ("", "", "", "tool_docs check mode requires a non-empty 'query'.")
        return ("check", "", query, "")

    return ("", "", "", "tool_docs requires structured input with fields.")


def _is_tool_category_query(text: str) -> bool:
    t = (text or "").strip().lower()
    if not t:
        return False
    category_markers = (
        "what tools",
        "which tools",
        "tools for",
        "tool for",
        "tooling for",
        "coding tools",
        "debugging tools",
        "research tools",
        "compare tools",
        "tool comparison",
    )
    return any(marker in t for marker in category_markers)


def build_prompt_tool_context(registry: dict[str, str], *, exclude: set[str] | None = None) -> str:
    exclude = exclude or set()
    names = sorted(name for name in registry.keys() if name not in exclude)

    core_docs = {}
    non_core_names = []
    for name in names:
        doc = _clean_doc(registry.get(name))
        if _is_core_tool_name(name):
            core_docs[name] = doc
        else:
            non_core_names.append(name)

    payload = {
        "core_tools_with_docstrings": core_docs,
        "other_tools_name_only": non_core_names,
    }
    return json.dumps(payload, indent=2)


def build_verbose_tool_definitions(registry: dict[str, str], *, exclude: set[str] | None = None) -> str:
    exclude = exclude or set()
    payload = {
        name: _clean_doc(registry.get(name))
        for name in sorted(registry.keys())
        if name not in exclude
    }
    return json.dumps(payload, indent=2)


def enforce_tool_docs_requirement(
    tool_result: dict,
    *,
    registry: dict[str, str],
    documented_tools: set[str],
    latest_user_input: str | None = None,
) -> dict | None:
    tool_name = str(tool_result.get("tool") or "").strip()
    if not tool_name:
        return {
            "_continue_loop": True,
            "user_message": "Invalid tool call: missing tool name.",
        }

    if tool_name == "tool_docs":
        mode, target_name, query, error = _parse_tool_docs_request(tool_result.get("input"))
        if error:
            return {
                "_continue_loop": True,
                "user_message": (
                    f"{error} Use `mode=lookup` + `tool=<name>` or "
                    "`mode=check` + `query=<task>`."
                ),
            }
        if mode == "check":
            documented_tools.add("__tool_docs_check__")
            return None

        if _is_tool_category_query(latest_user_input or ""):
            return {
                "_continue_loop": True,
                "user_message": (
                    "This is a category/comparison request. Call tool_docs in check mode with "
                    f"mode='check' and query='{(latest_user_input or '').strip()}'."
                ),
            }

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

    if _is_core_tool_name(tool_name):
        return None

    if tool_name not in documented_tools:
        return {
            "_continue_loop": True,
            "user_message": (
                f"Before calling '{tool_name}', call tool_docs with mode='lookup' and tool='{tool_name}' "
                "and then retry with correct parameters."
            ),
        }

    return None


class ToolDocsTool(Tool):
    """Return detailed usage documentation for tools.

    Input contract: structured JSON payload only.
    - lookup mode: `{"mode":"lookup","tool":"<tool_name>"}` returns one tool docstring.
    - check mode: `{"mode":"check","query":"<task_or_category>"}` evaluates best-fit tools.
    """

    def run(self, data) -> dict:
        mode, target_name, query, error = _parse_tool_docs_request(data.get("input"))
        if error:
            return self.fail(
                f"{error} Expected JSON: "
                "{\"mode\":\"lookup\",\"tool\":\"repo\"} or "
                "{\"mode\":\"check\",\"query\":\"what tools for coding\"}."
            )

        if mode == "check":
            return self._check_task_fit(query)

        if target_name not in self.registry:
            available = ", ".join(sorted(self.registry.keys()))
            return self.fail(f"Unknown tool '{target_name}'. Available tools: {available}")

        return self.complete(_clean_doc(self.registry.get(target_name)))

    def _check_task_fit(self, query: str) -> dict:
        tool_defs = build_verbose_tool_definitions(self.registry)
        system_prompt = load_system_prompt(
            "tool_docs_check.md",
            {"TOOL_DEFINITIONS_JSON": tool_defs},
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Query to evaluate:\n{query}"},
        ]
        try:
            result = call_claude(messages, model=HAIKU, temperature=0.0).strip()
            if not result:
                return self.fail("Check mode returned an empty response.")
            return self.complete(result)
        except Exception as e:
            return self.fail(f"Check mode failed: {e}")
