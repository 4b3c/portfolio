import json
import sys
import uuid
from modules.assistant import AssistantModule
from modules.bash import BashModule
from modules.file import FileModule
from modules.memory import MemoryModule
from modules.summarize import SummarizeModule
from modules.search import SearchModule
from modules.reason import ReasonModule
from modules.failure import FailureModule
from modules.restart import RestartModule
from modules.code import CodeModule

CONTEXT_PATH = "data/context.json"
TRACE_PATH = "data/trace.json"

MODULES = {
    "assistant": AssistantModule,
    "bash": BashModule,
    "file": FileModule,
    "memory": MemoryModule,
    "summarize": SummarizeModule,
    "search": SearchModule,
    "reason": ReasonModule,
    "failure": FailureModule,
    "restart": RestartModule,
    "code": CodeModule,
}


def save_context(context):
    with open(CONTEXT_PATH, "w") as f:
        json.dump(context, f, indent=2)


def save_trace(trace):
    with open(TRACE_PATH, "w") as f:
        json.dump(trace, f, indent=2)


def find_active_path(node):
    """Recursively find the path of incomplete (no output) nodes from root to deepest active call."""
    if "output" in node:
        return None
    path = [node]
    for child in reversed(node.get("called", [])):
        child_path = find_active_path(child)
        if child_path:
            path.extend(child_path)
            break
    return path


def main_loop(trace, stack, current_node, result):
    while True:
        if "module" in result:
            child_node = {
                "id": str(uuid.uuid4())[:8],
                "module": result["module"],
                "input": result["input"],
                "called": [],
            }
            # Preserve conversation_id if present so restart can reconstruct assistant state
            if "conversation_id" in result:
                child_node["conversation_id"] = result["conversation_id"]

            current_node["called"].append(child_node)
            current_node = child_node

            save_trace(trace)
            save_context({
                "registry": {name: cls.__doc__ for name, cls in MODULES.items()},
                "trace": trace,
            })

            module_name = result["module"]
            if module_name not in MODULES:
                error = f"Module '{module_name}' not found."
                print(f"Error: {error}")
                result = {"module": "failure", "input": error}
                continue

            try:
                new_module = MODULES[module_name](CONTEXT_PATH)
                print(f"Running module: {module_name}")
                result = new_module.run(result)
                module = new_module
                stack.append((module, current_node))
            except Exception as e:
                error = f"Module '{module_name}' raised an exception: {e}"
                print(f"Error: {error}")
                result = {"module": "failure", "input": error}

        elif "output" in result:
            current_node["output"] = result["output"]
            save_trace(trace)

            stack.pop()

            if not stack:
                break

            caller_module, current_node = stack[-1]
            print(f"Resuming module: {current_node['module']}")
            result = caller_module.resume(result)


def run():
    trace = []
    root_node = {"id": str(uuid.uuid4())[:8], "module": "assistant", "input": None, "called": []}
    trace.append(root_node)

    save_trace(trace)
    save_context({
        "registry": {name: cls.__doc__ for name, cls in MODULES.items()},
        "trace": trace,
    })

    user_input = input("User: ")
    module = AssistantModule(CONTEXT_PATH)
    result = module.run({"module": "assistant", "input": user_input})
    stack = [(module, root_node)]

    main_loop(trace, stack, root_node, result)


def restart_run():
    print("[Zipper restarting — loading trace...]\n")

    with open(TRACE_PATH) as f:
        trace = json.load(f)

    save_context({
        "registry": {name: cls.__doc__ for name, cls in MODULES.items()},
        "trace": trace,
    })

    active_path = find_active_path(trace[0])

    if not active_path or len(active_path) < 2:
        print("No active session found in trace. Starting fresh.")
        run()
        return

    # The deepest node is the restart call — mark it complete
    restart_node = active_path[-1]
    restart_node["output"] = "Process restarted successfully."
    save_trace(trace)

    # Rebuild the stack for all ancestor nodes (everything above restart)
    stack = []
    for node in active_path[:-1]:
        m = MODULES[node["module"]](CONTEXT_PATH)
        stack.append((m, node))

    # Resume the parent module with the restart output
    current_node = active_path[-2]
    result = {
        "output": "Process restarted successfully.",
        "called_module": "restart",
    }
    if "conversation_id" in restart_node:
        result["conversation_id"] = restart_node["conversation_id"]

    print(f"Resuming module: {current_node['module']}\n")
    result = stack[-1][0].resume(result)

    main_loop(trace, stack, current_node, result)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "restart":
        restart_run()
    else:
        run()
