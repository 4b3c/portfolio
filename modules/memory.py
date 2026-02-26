import json
import os
from modules.module import Module

MEMORY_PATH = "data/memory.json"


def load_memory() -> dict:
    if not os.path.exists(MEMORY_PATH):
        return {}
    with open(MEMORY_PATH) as f:
        return json.load(f)


def save_memory(memory: dict):
    os.makedirs(os.path.dirname(MEMORY_PATH), exist_ok=True)
    with open(MEMORY_PATH, "w") as f:
        json.dump(memory, f, indent=2)


class MemoryModule(Module):
    """Read or write persistent key-value memory across sessions.

    Input contract: `data["input"]` is a JSON object/string with `action`
    in {'get','set','delete','list'} and `key`/`value` fields as needed.
    """

    def run(self, data) -> dict:
        try:
            params = self.input_json(data)
            action = params["action"]
        except (json.JSONDecodeError, KeyError) as e:
            return self.fail(f"Invalid input: {e}")

        memory = load_memory()

        if action == "set":
            key, value = params.get("key"), params.get("value")
            if not key:
                return self.fail("'key' is required for set.")
            memory[key] = value
            save_memory(memory)
            return self.complete(f"Saved '{key}'.")

        elif action == "get":
            key = params.get("key")
            if not key:
                return self.fail("'key' is required for get.")
            if key not in memory:
                return self.complete(f"No memory found for '{key}'.")
            return self.complete(str(memory[key]))

        elif action == "delete":
            key = params.get("key")
            if not key:
                return self.fail("'key' is required for delete.")
            if key in memory:
                del memory[key]
                save_memory(memory)
                return self.complete(f"Deleted '{key}'.")
            return self.complete(f"Key '{key}' not found.")

        elif action == "list":
            if not memory:
                return self.complete("Memory is empty.")
            return self.complete(json.dumps(memory, indent=2))

        else:
            return self.fail(f"Unknown action: {action}. Use 'get', 'set', 'delete', or 'list'.")
