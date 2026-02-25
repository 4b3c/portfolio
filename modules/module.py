import json

class Module:
    """Base class for all modules. Do not use directly."""

    def __init__(self, context_path):
        self.context = self.load_context(context_path)
    
    def load_context(self, path):
        with open(path) as f:
            return json.load(f)
    
    def run(self, data) -> dict:
        raise NotImplementedError
    
    def resume(self, result) -> dict:
        return self.complete(result["output"])
    
    def call(self, module, data):
        return {"module": module, "input": data}
    
    def fail(self, error):
        return {"output": f"Error: {error}"}
    
    def complete(self, data):
        return {"output": data}