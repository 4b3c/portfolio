from tools.conversational.assistant import AssistantTool
from tools.core.bash import BashTool
from tools.core.tool_docs import ToolDocsTool
from tools.coding.code import CodeTool
from tools.conversational.failure import FailureTool
from tools.coding.file import FileTool
from tools.other.http import HttpTool
from tools.core.memory import MemoryTool
from tools.conversational.planner import PlannerTool
from tools.coding.repo import RepoTool
from tools.conversational.reason import ReasonTool
from tools.core.restart import RestartTool
from tools.other.search import SearchTool
from tools.coding.stats import StatsTool
from tools.other.summarize import SummarizeTool
from tools.tool import Tool


TOOLS = {
    "assistant": AssistantTool,
    "bash": BashTool,
    "tool_docs": ToolDocsTool,
    "file": FileTool,
    "memory": MemoryTool,
    "planner": PlannerTool,
    "repo": RepoTool,
    "stats": StatsTool,
    "summarize": SummarizeTool,
    "search": SearchTool,
    "reason": ReasonTool,
    "failure": FailureTool,
    "restart": RestartTool,
    "code": CodeTool,
    "http": HttpTool,
}

TOOL_DESCRIPTIONS = {name: (cls.__doc__ or "").strip() for name, cls in TOOLS.items()}

__all__ = ["Tool", "TOOLS", "TOOL_DESCRIPTIONS"]
