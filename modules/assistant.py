import json
import os
import re
from time import time
from modules.module import Module
from utils.claude import call_claude

CONVERSATIONS_PATH = "data/conversations"

CODE_FENCE_RE = re.compile(r"```(?:\w+)?\s*(\{.*?\})\s*```", re.DOTALL)


def extract_module_call(text: str):
    """Extract a module call JSON from text, supporting code-fenced and bare-only JSON."""
    # Try all code fences — pick the first one that parses as a module call
    for match in CODE_FENCE_RE.finditer(text):
        try:
            parsed = json.loads(match.group(1))
            if "module" in parsed:
                return parsed
        except json.JSONDecodeError:
            continue
    # Only fall back to bare JSON if it's the entire message (no surrounding text)
    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        try:
            parsed = json.loads(stripped)
            if "module" in parsed:
                return parsed
        except json.JSONDecodeError:
            pass
    return None


def save_conversation(messages, path="unnamed.json"):
    path = f"{CONVERSATIONS_PATH}/{path}"
    with open(path, "w") as f:
        json.dump(messages, f, indent=2)


def new_conversation_id():
    return (str(int(time())) + "0")[-6:-1]


COMMANDS = {
    "/new":  "Start a new conversation.",
    "/load": "Load a conversation by ID. Usage: /load <id>",
    "/list": "List all saved conversations.",
    "/help": "Show available commands.",
}


class AssistantModule(Module):
    """Handles open-ended conversation, questions, and tasks that don't fit other modules. Input: a natural language string."""

    def __init__(self, context_path):
        super().__init__(context_path)
        self.messages = []
        self.conversation_id = new_conversation_id()

    def handle_command(self, user_input: str):
        """Handle a slash command. Returns True if handled, False if not a command."""
        parts = user_input.strip().split()
        cmd = parts[0].lower()

        if cmd == "/help":
            print("\nCommands:")
            for name, desc in COMMANDS.items():
                print(f"  {name} — {desc}")
            print()
            return True

        elif cmd == "/new":
            save_conversation(self.messages, path=f"{self.conversation_id}.json")
            self.conversation_id = new_conversation_id()
            self.messages = []
            print(f"\nStarted new conversation {self.conversation_id}.\n")
            first = input("User: ").strip()
            if first:
                self._init_messages(first)
            return True

        elif cmd == "/list":
            os.makedirs(CONVERSATIONS_PATH, exist_ok=True)
            files = sorted(f.replace(".json", "") for f in os.listdir(CONVERSATIONS_PATH) if f.endswith(".json"))
            if files:
                print("\nSaved conversations:")
                for f in files:
                    print(f"  {f}")
                print()
            else:
                print("\nNo saved conversations.\n")
            return True

        elif cmd == "/load":
            if len(parts) < 2:
                print("\nUsage: /load <id>\n")
                return True
            conv_id = parts[1]
            path = f"{CONVERSATIONS_PATH}/{conv_id}.json"
            if not os.path.exists(path):
                print(f"\nConversation '{conv_id}' not found.\n")
                return True
            with open(path) as f:
                self.messages = json.load(f)
            self.conversation_id = conv_id
            print(f"\nLoaded conversation {conv_id}.\n")
            return True

        return False

    def _init_messages(self, user_input: str):
        self.messages = [
            {
                "role": "system", "content": f"""
                    You are a helpful assistant named Zipper. Respond clearly and concisely. If the conversation is complete, respond with only the word "done".

                    You have NO built-in abilities to read files, run commands, search the web, or perform any actions yourself. You cannot use XML tags, function calls, or any other syntax to invoke tools. The only way to take action is to output a module call.

                    To take action, wrap a JSON object in a code fence like this:

                    ```json
                    {{"module": "<module_name>", "input": "<input>"}}
                    ```

                    You can include text before or after the code fence to explain what you are doing. Only call ONE module at a time. After calling a module, stop and wait — the output will be returned to you in the next message before you continue. Never call another module until you have received the output from the previous one.

                    Available modules:
                    {json.dumps({k: v for k, v in self.context["registry"].items() if k != "assistant"}, indent=2)}

                    If you need to read a file, run a command, search, or do anything beyond answering from knowledge — use a module. Never fabricate results. Never claim you saw output you haven't received. If you don't know something, say so or call a module to find out.

                    Choose modules based on their descriptions. If a tool call fails, do not repeat it — try a different approach. When in doubt about a complex task, call reason first.
                """
            },
            {"role": "user", "content": user_input}
        ]

    def conversation_loop(self) -> dict:
        while True:
            raw = call_claude(self.messages).strip()
            self.messages.append({"role": "assistant", "content": raw})

            # Check if the assistant wants to call another module
            parsed = extract_module_call(raw)
            if parsed and "module" in parsed:
                save_conversation(self.messages, path=f"{self.conversation_id}.json")
                result = self.call(parsed["module"], parsed.get("input", ""))
                result["conversation_id"] = self.conversation_id
                result["called_module"] = parsed["module"]
                return result

            print(f"Assistant: {raw}\n")
            if raw.lower() == "done":
                break

            user_input = input("User: ").strip()

            if user_input.startswith("/"):
                if self.handle_command(user_input):
                    if not self.messages:
                        break
                    continue

            self.messages.append({"role": "user", "content": user_input})
            if user_input.lower() == "done":
                break

            save_conversation(self.messages, path=f"{self.conversation_id}.json")

        save_conversation(self.messages, path=f"{self.conversation_id}.json")
        return self.complete("Assistant session completed.")

    def run(self, data) -> dict:
        self._init_messages(data["input"])
        return self.conversation_loop()

    def resume(self, result) -> dict:
        self.conversation_id = result.get("conversation_id", self.conversation_id)
        called_module = result.get("called_module", "module")

        with open(f"{CONVERSATIONS_PATH}/{self.conversation_id}.json") as f:
            self.messages = json.load(f)

        self.messages.append({"role": "user", "content": f"[{called_module} output]: {result['output']}"})
        print(f"{called_module}:\n{result['output']}\n")
        return self.conversation_loop()
