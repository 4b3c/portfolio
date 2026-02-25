from modules.assistant import AssistantModule
from modules.bash import BashModule
from modules.code import CodeModule
from modules.failure import FailureModule
from modules.file import FileModule
from modules.http import HttpModule
from modules.memory import MemoryModule
from modules.planner import PlannerModule
from modules.repo import RepoModule
from modules.reason import ReasonModule
from modules.restart import RestartModule
from modules.search import SearchModule
from modules.summarize import SummarizeModule

MODULES = {
    "assistant": AssistantModule,
    "bash": BashModule,
    "file": FileModule,
    "memory": MemoryModule,
    "planner": PlannerModule,
    "repo": RepoModule,
    "summarize": SummarizeModule,
    "search": SearchModule,
    "reason": ReasonModule,
    "failure": FailureModule,
    "restart": RestartModule,
    "code": CodeModule,
    "http": HttpModule,
}

MODULE_DESCRIPTIONS = {name: cls.__doc__ for name, cls in MODULES.items()}
