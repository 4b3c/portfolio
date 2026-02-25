import json
from time import time
from modules.module import Module
from utils.claude import call_claude

CONVERSATIONS_PATH = "data/conversations"


def save_conversation(messages, path="unnamed.json"):
    path = f"{CONVERSATIONS_PATH}/{path}"
    with open(path, "w") as f:
        json.dump(messages, f, indent=2)

class AssistantModule(Module):
    """Handles open-ended conversation, questions, and tasks that don't fit other modules. Input: a natural language string."""

    def __init__(self, context_path):
        super().__init__(context_path)
        self.messages = []
        self.conversation_id = (str(int(time())) + "0")[-6:-1]

    def conversation_loop(self) -> dict:
        while True:
            raw = call_claude(self.messages).strip()
            self.messages.append({"role": "assistant", "content": raw})

            # Check if the assistant wants to call another module
            try:
                parsed = json.loads(raw)
                if "module" in parsed and "input" in parsed:
                    save_conversation(self.messages, path=f"{self.conversation_id}.json")
                    result = self.call(parsed["module"], parsed["input"])
                    result["conversation_id"] = self.conversation_id
                    result["called_module"] = parsed["module"]
                    return result
            except (json.JSONDecodeError, TypeError):
                pass

            print(f"Assistant: {raw}\n")
            if raw.lower() == "done":
                break

            user_input = input("User (type 'done' to finish): ")
            self.messages.append({"role": "user", "content": user_input})
            if user_input.lower() == "done":
                break

            save_conversation(self.messages, path=f"{self.conversation_id}.json")

        save_conversation(self.messages, path=f"{self.conversation_id}.json")
        return self.complete("Assistant session completed.")

    def run(self, data) -> dict:
        self.messages = [
            {
                "role": "system", "content": f"""
                    You are a helpful assistant named Zipper. Your job is to help with any task or question the user has. Respond in a clear and concise manner, providing useful information or guidance based on the user's input. If the user asks a question, provide a direct answer. If the user asks for help with a task, provide step-by-step instructions or relevant information to assist them. If the conversation is complete respond with only the word "done" and nothing else.

                    You also have the ability to hand off to another module at any point in the conversation. The available modules are:
                    {json.dumps({k: v for k, v in self.context["registry"].items() if k != "assistant" and k != "interface"}, indent=2)}

                    If the user's request would be better handled by another module, respond with only a valid JSON object in this exact format and nothing else:
                    {{"module": "<module_name>", "input": "<the input to pass to that module>"}}
                    Do not include any explanation, markdown, or extra text when doing this.
                """
            },
            {
                "role": "user", "content": data["input"]
            }
        ]
        return self.conversation_loop()

    def resume(self, result) -> dict:
        self.conversation_id = result.get("conversation_id", self.conversation_id)
        called_module = result.get("called_module", "module")

        with open(f"{CONVERSATIONS_PATH}/{self.conversation_id}.json") as f:
            self.messages = json.load(f)

        self.messages.append({"role": "user", "content": f"[{called_module} output]: {result['output']}"})
        print(f"{called_module}: {result['output']}\n")
        return self.conversation_loop()
