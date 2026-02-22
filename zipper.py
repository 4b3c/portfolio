import json
from modules.interface import InterfaceModule
from modules.router import RouterModule
from modules.assistant import AssistantModule

CONTEXT_PATH = "context.json"
TRACE_PATH = "trace.json"

MODULES = {
    "interface": InterfaceModule,
    "router": RouterModule,
    "assistant": AssistantModule,
}

def save_context(context):
    with open(CONTEXT_PATH, "w") as f:
        json.dump(context, f, indent=2)


def save_trace(trace):
    with open(TRACE_PATH, "w") as f:
        json.dump(trace, f, indent=2)

def run():
    trace = []

    root_node = {"module": "interface", "input": None, "called": []}
    trace.append(root_node)
    current_node = root_node

    save_trace(trace)
    save_context({
        "registry": {name: cls.__doc__ for name, cls in MODULES.items()},
        "trace": trace,
    })

    module = MODULES["interface"](CONTEXT_PATH)
    print(f"Running module: interface")
    result = module.run({"module": "interface", "input": None})

    # stack entries: (module_instance, trace_node_of_that_module)
    stack = [(module, current_node)]

    while True:
        if "module" in result:
            child_node = {"module": result["module"], "input": result["input"], "called": []}
            current_node["called"].append(child_node)
            current_node = child_node

            save_trace(trace)
            save_context({
                "registry": {name: cls.__doc__ for name, cls in MODULES.items()},
                "trace": trace,
            })

            new_module = MODULES[result["module"]](CONTEXT_PATH)
            print(f"Running module: {result['module']}")
            result = new_module.run(result)
            module = new_module
            stack.append((module, current_node))

        elif "output" in result:
            current_node["output"] = result["output"]
            save_trace(trace)

            stack.pop()  # pop the module that just completed

            if not stack:
                break

            caller_module, current_node = stack[-1]
            print(f"Resuming module: {current_node['module']}")
            result = caller_module.resume(result["output"])

if __name__ == "__main__":
    run()
