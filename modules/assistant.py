import json
import os
import re
from modules.module import Module
from utils.claude import HAIKU, SONNET, OPUS, call_claude
from utils.colors import print_user, print_error, print_state, print_info, stream_label, stream_end, LineStream, _YELLOW, _WHITE, _CYAN
from utils.function_calls import maybe_dispatch_module_call
from utils.prompts import load_system_prompt
from utils.session import (
    conversation_path,
    list_numeric_conversation_labels,
    next_compacted_conversation_label,
    next_root_conversation_label,
)


def save_conversation(messages, conversation_id: str):
    if not conversation_id:
        return
    path = conversation_path(conversation_id)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(messages, f, indent=2)


COMMANDS = {
    "/new":  "Start a new conversation.",
    "/load": "Load a conversation by ID. Usage: /load <id>",
    "/list": "List all saved conversations.",
    "/help": "Show available commands.",
}

AUTO_COMPACT_MIN_MESSAGES = 18
AUTO_COMPACT_MAX_CHARS = 12000
AUTO_COMPACT_COOLDOWN_USER_TURNS = 4


class AssistantModule(Module):
    """Handles open-ended conversation, questions, and tasks that don't fit other modules. Input: a natural language string."""

    def __init__(self, registry=None):
        super().__init__(registry)
        self.messages = []
        self.conversation_id = None
        self.current_model = HAIKU
        self.current_difficulty = 1
        self.last_compact_user_turn = 0

    def _select_model(self, difficulty: int) -> str:
        if difficulty <= 2:
            return HAIKU
        if difficulty <= 4:
            return SONNET
        return OPUS

    def _is_keyword_or_command(self, user_input: str) -> bool:
        text = (user_input or "").strip().lower()
        if not text:
            return True
        if text == "done":
            return True
        if text.startswith("/"):
            return True
        return False

    def _recent_context_for_classification(self) -> str:
        recent = [m for m in self.messages if m.get("role") in {"user", "assistant"}][-2:]
        if not recent:
            return "(none)"

        rendered = []
        for msg in recent:
            role = msg.get("role", "unknown").upper()
            content = msg.get("content", "")
            if len(content) > 700:
                content = content[:700] + "...[truncated]"
            rendered.append(f"{role}: {content}")
        return "\n".join(rendered)

    def _classify_difficulty(self, user_input: str, context_snippet: str) -> int:
        classifier_messages = [
            {
                "role": "system",
                "content": load_system_prompt("assistant_classifier.md"),
            },
            {
                "role": "user",
                "content": (
                    f"Recent context:\n{context_snippet}\n\n"
                    f"Latest user input:\n{user_input}"
                ),
            },
        ]
        try:
            raw = call_claude(classifier_messages, model=HAIKU, temperature=0.0).strip()
            match = re.search(r"[1-5]", raw)
            if match:
                return int(match.group(0))
        except Exception:
            pass
        return 2

    def _update_model_for_user_input(self, user_input: str, announce: bool = True):
        if self._is_keyword_or_command(user_input):
            self.current_difficulty = 1
            self.current_model = HAIKU
            return

        context_snippet = self._recent_context_for_classification()
        self.current_difficulty = self._classify_difficulty(user_input, context_snippet)
        self.current_model = self._select_model(self.current_difficulty)
        if announce:
            print_state(f"Difficulty {self.current_difficulty}/5 -> model {self.current_model}")

    def _refresh_model_from_history(self):
        for msg in reversed(self.messages):
            if msg.get("role") != "user":
                continue
            content = msg.get("content", "")
            if re.match(r"^\[.+ output\]:", content):
                continue
            self._update_model_for_user_input(content, announce=False)
            return
        self.current_difficulty = 1
        self.current_model = HAIKU

    def _message_chars(self) -> int:
        return sum(len(m.get("content", "")) for m in self.messages)

    def _user_turn_count(self) -> int:
        return sum(
            1
            for m in self.messages
            if m.get("role") == "user" and not re.match(r"^\[.+ output\]:", m.get("content", ""))
        )

    def _latest_real_user_input(self) -> str:
        for msg in reversed(self.messages):
            if msg.get("role") != "user":
                continue
            content = msg.get("content", "")
            if re.match(r"^\[.+ output\]:", content):
                continue
            return content
        return ""

    def _should_auto_compact(self) -> bool:
        if not self.messages:
            return False
        over_messages = len(self.messages) >= AUTO_COMPACT_MIN_MESSAGES
        over_chars = self._message_chars() >= AUTO_COMPACT_MAX_CHARS
        if not (over_messages or over_chars):
            return False
        turns_since_compact = self._user_turn_count() - self.last_compact_user_turn
        return turns_since_compact >= AUTO_COMPACT_COOLDOWN_USER_TURNS

    def _compact_conversation(self):
        if not self.messages:
            return

        old_id = self.conversation_id
        system_message = self.messages[0] if self.messages[0].get("role") == "system" else None
        if not system_message:
            return

        latest_goal = self._latest_real_user_input()
        transcript = "\n\n".join(
            f"{m.get('role', 'unknown').upper()}:\n{m.get('content', '')}"
            for m in self.messages
            if m.get("role") != "system"
        )

        compact_messages = [
            {
                "role": "system",
                "content": load_system_prompt("assistant_compact.md"),
            },
            {
                "role": "user",
                "content": (
                    f"Latest user goal:\n{latest_goal}\n\n"
                    f"Conversation transcript:\n{transcript}"
                ),
            },
        ]

        try:
            compacted = call_claude(compact_messages, model=HAIKU, temperature=0.0).strip()
        except Exception:
            return

        self.conversation_id = next_compacted_conversation_label(old_id)
        self.messages = [
            system_message,
            {
                "role": "user",
                "content": (
                    f"[Compacted context from conversation {old_id}]\n"
                    "Use this as canonical context. Continue the active task using only relevant details.\n\n"
                    f"{compacted}"
                ),
            },
        ]
        self.last_compact_user_turn = self._user_turn_count()
        save_conversation(self.messages, self.conversation_id)
        print_state(f"Auto-compacted conversation {old_id} -> {self.conversation_id}")

    def _maybe_auto_compact(self):
        if self._should_auto_compact():
            self._compact_conversation()

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
            save_conversation(self.messages, self.conversation_id)
            self.conversation_id = next_root_conversation_label()
            self.messages = []
            self.last_compact_user_turn = 0
            print_state(f"\nStarted new conversation {self.conversation_id}.\n")
            first = input(print_user()).strip()
            if first:
                self._init_messages(first)
            return True

        elif cmd == "/list":
            files = list_numeric_conversation_labels()
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
            path = conversation_path(conv_id)
            if not os.path.exists(path):
                print_error(f"\nConversation '{conv_id}' not found.\n")
                return True
            with open(path) as f:
                self.messages = json.load(f)
            self.conversation_id = conv_id
            self.last_compact_user_turn = self._user_turn_count()
            self._refresh_model_from_history()
            print_state(f"\nLoaded conversation {conv_id}.\n")
            return True

        return False

    def _init_messages(self, user_input: str):
        if not self.conversation_id:
            self.conversation_id = next_root_conversation_label()
        self._update_model_for_user_input(user_input)
        modules_json = json.dumps({k: v for k, v in self.registry.items() if k != "assistant"}, indent=2)
        self.messages = [
            {
                "role": "system",
                "content": load_system_prompt(
                    "assistant.md",
                    {"AVAILABLE_MODULES_JSON": modules_json},
                ),
            },
            {"role": "user", "content": user_input}
        ]
        self.last_compact_user_turn = self._user_turn_count()

    def conversation_loop(self) -> dict:
        while True:
            self._maybe_auto_compact()
            stream_label("Assistant:", _YELLOW)
            ls = LineStream(_WHITE, fn_color=_CYAN)
            raw = call_claude(self.messages, model=self.current_model, on_token=ls.token).strip()
            ls.flush()
            stream_end()
            self.messages.append({"role": "assistant", "content": raw})

            # Check if the assistant wants to call another module
            module_result = maybe_dispatch_module_call(self, raw, include_called_module=True)
            if module_result:
                save_conversation(self.messages, self.conversation_id)
                module_result["conversation_id"] = self.conversation_id
                return module_result

            if raw.lower() == "done":
                break

            user_input = input(print_user()).strip()

            if not user_input:
                continue

            if user_input.startswith("/"):
                if self.handle_command(user_input):
                    if not self.messages:
                        break
                    continue

            self._update_model_for_user_input(user_input)
            self.messages.append({"role": "user", "content": user_input})
            if user_input.lower() == "done":
                break

            save_conversation(self.messages, self.conversation_id)

        save_conversation(self.messages, self.conversation_id)
        return self.complete("Assistant session completed.")

    def run(self, data) -> dict:
        self._init_messages(data["input"])
        return self.conversation_loop()

    def resume(self, result) -> dict:
        self.conversation_id = result.get("conversation_id", self.conversation_id)
        called_module = result.get("called_module", "module")

        with open(conversation_path(self.conversation_id)) as f:
            self.messages = json.load(f)

        self._refresh_model_from_history()
        self.messages.append({"role": "user", "content": f"[{called_module} output]: {result['output']}"})
        return self.conversation_loop()
