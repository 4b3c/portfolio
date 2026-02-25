import json
from modules.module import Module
from utils.ollama import call_ollama
from utils.claude import call_claude

class RouterModule(Module):
    """Reads user input and routes it to the appropriate module. Input: a natural language string."""

    def run(self, data) -> dict:
        registry = self.context["registry"]
        payload = data["input"]
        
        messages = [
            {
                "role": "system", "content": f"""
                    You are a routing system. Your only job is to read the user input and decide which module should handle it, and then pass an appropriate input to that module.

                    Available modules:
                    {json.dumps(registry, indent=2)}

                    You must respond with only a valid JSON object in this exact format:
                    {{"module": "<module_name>", "input": "<the input to the module>"}}

                    Rules:
                    - module must be one of the exact keys from the available modules
                    - input must be accepted by the target module
                    - do not include any explanation, markdown, or extra text
                    - if no module fits, assume assistant module and pass the entire user input to it
                """
            },
            {
                "role": "user", "content": payload
            }
        ]
        
        raw = call_claude(messages).strip()
        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            return self.fail(f"Failed to parse Claude response: {raw}")
        target = result["module"]
        routed_input = result["input"]

        if target not in registry:
            return self.fail(f"No module found for: {payload}")

        return self.call(target, routed_input)

    def resume(self, data):
        return self.complete(f"Route task completed with no issues: {data}")
