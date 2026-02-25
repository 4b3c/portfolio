import json
import os
import re
from time import time
from modules.module import Module
from utils.claude import call_claude
from utils.colors import print_assistant, print_user, print_error, print_state, print_info, print_module_output

CONVERSATIONS_PATH = "data/conversations"

FUNCTION_CALL_RE = re.compile(r"<function_calls>\s*<invoke name=\"(\w+)\">(.*?)</invoke>\s*</function_calls>", re.DOTALL)
PARAM_RE = re.compile(r'<parameter name="(\w+)">(.*?)</parameter>', re.DOTALL)


def extract_module_call(text: str):
    """Extract a module call from text, supporting XML function_calls syntax."""
    match = FUNCTION_CALL_RE.search(text)
    if match:
        module_name = match.group(1)
        params = {m.group(1): m.group(2) for m in PARAM_RE.finditer(match.group(2))}
        if len(params) == 1 and "input" in params:
            input_val = params["input"]
        else:
            input_val = json.dumps(params)
        return {"module": module_name, "input": input_val}
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
            print_info("\nCommands:")
            for name, desc in COMMANDS.items():
                print_info(f"  {name} — {desc}")
            print_info("")
            return True

        elif cmd == "/new":
            save_conversation(self.messages, path=f"{self.conversation_id}.json")
            self.conversation_id = new_conversation_id()
            self.messages = []
            print_state(f"\nStarted new conversation {self.conversation_id}.\n")
            first = input(print_user()).strip()
            if first:
                self._init_messages(first)
            return True

        elif cmd == "/list":
            os.makedirs(CONVERSATIONS_PATH, exist_ok=True)
            files = sorted(f.replace(".json", "") for f in os.listdir(CONVERSATIONS_PATH) if f.endswith(".json"))
            if files:
                print_info("\nSaved conversations:")
                for f in files:
                    print_info(f"  {f}")
                print_info("")
            else:
                print_info("\nNo saved conversations.\n")
            return True

        elif cmd == "/load":
            if len(parts) < 2:
                print_info("\nUsage: /load <id>\n")
                return True
            conv_id = parts[1]
            path = f"{CONVERSATIONS_PATH}/{conv_id}.json"
            if not os.path.exists(path):
                print_error(f"\nConversation '{conv_id}' not found.\n")
                return True
            with open(path) as f:
                self.messages = json.load(f)
            self.conversation_id = conv_id
            print_state(f"\nLoaded conversation {conv_id}.\n")
            return True

        return False

    def _init_messages(self, user_input: str):
        self.messages = [
            {
                "role": "system", "content": f"""
                    You are a helpful assistant named Zipper. Respond clearly and concisely. If the conversation is complete, respond with only the word "done".

                    You have NO built-in abilities to read files, run commands, search the web, or perform any actions yourself. The only way to take action is to use a function call.

                    To take action, use this syntax:

                    <function_calls>
                    <invoke name="<module_name>">
                    <parameter name="<param_name>"><value></parameter>
                    </invoke>
                    </function_calls>

                    For modules that take a plain string (bash, reason, summarize, search), use a single "input" parameter. For modules that take structured input (file, code, memory), use one parameter per field — no JSON escaping needed.

                    You may include text before the function call to explain what you are doing. The function call must be the last thing in your message — never write anything after it. After sending a module call, you will receive the output in the next message before you continue. Never describe, predict, or fabricate what the output will be.

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

            print_assistant(raw)
            if raw.lower() == "done":
                break

            user_input = input(print_user()).strip()

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
        print_module_output(called_module, result['output'])
        return self.conversation_loop()
