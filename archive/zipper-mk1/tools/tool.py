import json

class Tool:
    """Base class for all tools.

    Standard tool input contract:
    - Runtime always passes payload as `data["input"]`.
    - Use `input_text(...)` for plain-text tools.
    - Use `input_json(...)` for structured tools.
    """

    def __init__(self, registry=None):
        self.registry = registry or {}
    
    def run(self, data) -> dict:
        raise NotImplementedError
    
    def resume(self, result) -> dict:
        return self.complete(result["output"])
    
    def call(self, tool, data):
        if isinstance(data, dict):
            data = json.dumps(data)
        return {"tool": tool, "input": data}

    def input_text(self, data, *, default: str = "") -> str:
        raw = data.get("input", default)
        if raw is None:
            return default
        return str(raw)

    def input_json(self, data, *, fallback: dict | None = None) -> dict:
        raw = data.get("input")
        if isinstance(raw, dict):
            return raw
        if raw is None:
            return fallback if fallback is not None else {}
        text = str(raw).strip()
        if not text:
            return fallback if fallback is not None else {}
        if text.startswith("{"):
            return json.loads(text)
        return fallback if fallback is not None else {}
    
    def fail(self, error):
        return {"output": f"Error: {error}"}
    
    def complete(self, data):
        return {"output": data}
