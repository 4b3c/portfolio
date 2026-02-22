import json
from modules.interface import InterfaceModule
from modules.router import RouterModule

CONTEXT_PATH = "context.json"
TRACE_PATH = "trace.json"

MODULES = {
    "interface": InterfaceModule,
    "router": RouterModule,
}

def save_context(context):
    with open(CONTEXT_PATH, "w") as f:
        json.dump(context, f, indent=2)


def save_trace(trace):
    with open(TRACE_PATH, "w") as f:
        json.dump(trace, f, indent=2)

def run():
    trace = []
    stack = []
    
    current = {"module": "interface", "input": None}
    
    while True:
        module_name = current["module"]
        
        trace.append(current)
        save_trace(trace)
        save_context({
            "registry": {name: cls.__doc__ for name, cls in MODULES.items()},
            "trace": trace,
            "current": current
        })
        
        module = MODULES[module_name](CONTEXT_PATH)
        print(f"Running module: {module_name}")
        result = module.run(current)
        
        if "module" in result:
            stack.append(module)  # store instance not name
            current = result
        
        elif "output" in result:
            if stack:
                caller = stack.pop()  # get the actual instance back
                current = caller.resume(result["output"])
            else:
                current = {"module": "interface", "input": result["output"]}

if __name__ == "__main__":
    run()