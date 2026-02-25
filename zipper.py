import json
import sys
import uuid
from modules.registry import MODULES, MODULE_DESCRIPTIONS
from utils.colors import print_error, print_module, print_state, print_user

TRACE_PATH = "data/trace.json"


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
                "id": str(uuid.uuid4())[:12],
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

            module_name = result["module"]
            if module_name not in MODULES:
                error = f"Module '{module_name}' not found."
                print_error("Error:", error)
                result = {"module": "failure", "input": error}
                continue

            try:
                new_module = MODULES[module_name](MODULE_DESCRIPTIONS)
                print_module("Running module:", module_name, result.get("input", "") or "")
                result = new_module.run(result)
                module = new_module
                stack.append((module, current_node))
            except Exception as e:
                error = f"Module '{module_name}' raised an exception: {e}"
                print_error("Error:", error)
                result = {"module": "failure", "input": error}

        elif "output" in result:
            current_node["output"] = result["output"]
            save_trace(trace)

            stack.pop()

            if not stack:
                break

            caller_module, current_node = stack[-1]
            output_preview = (result.get("output", "") or "").strip().split('\n')[0]
            print_module("Resuming module:", current_node['module'], output_preview)
            result = caller_module.resume(result)


def run():
    trace = []
    root_node = {"id": str(uuid.uuid4())[:12], "module": "assistant", "input": None, "called": []}
    trace.append(root_node)

    save_trace(trace)

    user_input = input(print_user())
    module = MODULES["assistant"](MODULE_DESCRIPTIONS)
    result = module.run({"module": "assistant", "input": user_input})
    stack = [(module, root_node)]

    main_loop(trace, stack, root_node, result)


def restart_run():
    print_state("[Zipper restarting — loading trace...]\n")

    with open(TRACE_PATH) as f:
        trace = json.load(f)

    active_path = find_active_path(trace[0])

    if not active_path or len(active_path) < 2:
        print_error("No active session found in trace. Starting fresh.")
        run()
        return

    # The deepest node is the restart call — mark it complete
    restart_node = active_path[-1]
    restart_node["output"] = "Process restarted successfully."
    save_trace(trace)

    # Rebuild the stack for all ancestor nodes (everything above restart)
    stack = []
    for node in active_path[:-1]:
        m = MODULES[node["module"]](MODULE_DESCRIPTIONS)
        stack.append((m, node))

    # Resume the parent module with the restart output
    current_node = active_path[-2]
    result = {
        "output": "Process restarted successfully.",
        "called_module": "restart",
    }
    if "conversation_id" in restart_node:
        result["conversation_id"] = restart_node["conversation_id"]

    print_module("Resuming module:", current_node['module'])
    result = stack[-1][0].resume(result)

    main_loop(trace, stack, current_node, result)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "restart":
        restart_run()
    else:
        run()
