from tools.tool import Tool
from utils.tool_docs import get_tool_doc, parse_tool_name_from_input


class ToolDocsTool(Tool):
    """Return detailed usage documentation for a named tool.

    Input contract: `data["input"]` is a tool name as plain text, or a
    structured payload containing `name`/`tool`.
    """

    def run(self, data) -> dict:
        target_name = parse_tool_name_from_input(data.get("input"))
        if not target_name:
            available = ", ".join(sorted(self.registry.keys()))
            return self.fail(
                "A tool name is required. Provide plain text like 'repo' or a payload with 'name'. "
                f"Available tools: {available}"
            )

        if target_name not in self.registry:
            available = ", ".join(sorted(self.registry.keys()))
            return self.fail(f"Unknown tool '{target_name}'. Available tools: {available}")

        return self.complete(get_tool_doc(target_name, self.registry.get(target_name)))
