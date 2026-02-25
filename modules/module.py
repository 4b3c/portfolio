import json

class Module:
    """Base class for all modules. Do not use directly."""

    def __init__(self, registry=None):
        self.registry = registry or {}
    
    def run(self, data) -> dict:
        raise NotImplementedError
    
    def resume(self, result) -> dict:
        return self.complete(result["output"])
    
    def call(self, module, data):
        if isinstance(data, dict):
            data = json.dumps(data)
        return {"module": module, "input": data}
    
    def fail(self, error):
        return {"output": f"Error: {error}"}
    
    def complete(self, data):
        return {"output": data}
