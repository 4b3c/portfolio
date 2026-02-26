import json
import os
import re
from modules.module import Module
from utils.claude import HAIKU, SONNET, OPUS, call_claude
from utils.colors import print_user, print_error, print_state, print_info, _YELLOW, _CYAN
from utils.conversation import (
    ConversationRuntime,
    ConversationStore,
    parse_wait_signal,
    should_resume_paused_module,
)
from utils.prompts import load_system_prompt


COMMANDS = {
    "/new":  "Start a new conversation.",
    "/load": "Load a conversation by ID. Usage: /load <id>",
    "/list": "List all saved conversations.",
    "/help": "Show available commands.",
}

AUTO_COMPACT_MIN_MESSAGES = 18
AUTO_COMPACT_MAX_CHARS = 12000
AUTO_COMPACT_COOLDOWN_USER_TURNS = 4
AUTO_COMPACT_EXTEND_MESSAGES = 8
AUTO_COMPACT_EXTEND_CHARS = 6000
AUTO_COMPACT_MAX_EXTENSIONS = 6
LOW_SIGNAL_USER_INPUTS = {
    "yes",
    "y",
    "no",
    "n",
    "ok",
    "okay",
    "k",
    "cool",
    "nice",
    "thanks",
    "thank you",
    "hmm",
    "hm",
    "continue",
    "go ahead",
}


class AssistantModule(Module):
    """Handles open-ended conversation, questions, and tasks that don't fit other modules. Input: a natural language string."""

    def __init__(self, registry=None):
        super().__init__(registry)
        self.store = ConversationStore("assistant")
        self.messages = []
        self.conversation_id = None
        self.current_model = HAIKU
        self.current_difficulty = 1
        self.last_compact_user_turn = 0
        self.compact_extension_level = 0

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

    def _is_done_input(self, user_input: str) -> bool:
        return (user_input or "").strip().lower() == "done"

    def _is_conversation_key(self, key: str) -> bool:
        return key == "conversation_id" or key.endswith("_conversation_id")

    def _recent_context_for_classification(self) -> str:
        recent = []
        for m in self.messages:
            role = m.get("role")
            if role not in {"user", "assistant"}:
                continue
            if role == "user" and self._is_synthetic_user_message(m.get("content", "")):
                continue
            recent.append(m)
        recent = recent[-2:]
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
            if self._is_synthetic_user_message(content):
                continue
            self._update_model_for_user_input(content, announce=False)
            return
        self.current_difficulty = 1
        self.current_model = HAIKU

    def _message_chars(self) -> int:
        return sum(len(m.get("content", "")) for m in self.messages)

    def _is_low_signal_user_input(self, content: str) -> bool:
        text = (content or "").strip().lower()
        if not text:
            return True
        if text in LOW_SIGNAL_USER_INPUTS:
            return True
        if len(text) <= 2:
            return True
        return False

    def _user_turn_count(self) -> int:
        turns = 0
        for m in self.messages:
            if m.get("role") != "user":
                continue
            if self._is_synthetic_user_message(m.get("content", "")):
                continue
            turns += 1
        return turns

    def _latest_real_user_input(self) -> str:
        for msg in reversed(self.messages):
            if msg.get("role") != "user":
                continue
            content = msg.get("content", "")
            if self._is_synthetic_user_message(content):
                continue
            return content
        return ""

    def _latest_substantive_user_goal(self) -> str:
        latest_real = ""
        for msg in reversed(self.messages):
            if msg.get("role") != "user":
                continue
            content = (msg.get("content", "") or "").strip()
            if not content or self._is_synthetic_user_message(content):
                continue
            if not latest_real:
                latest_real = content
            if self._is_keyword_or_command(content):
                continue
            if self._is_low_signal_user_input(content):
                continue
            return content
        return latest_real

    def _is_tool_output_user_message(self, content: str) -> bool:
        text = (content or "").strip()
        return bool(
            re.match(r"^\[[^\]]+\soutput\]:", text, flags=re.IGNORECASE)
            or text.startswith("[TOOL OUTPUT")
        )

    def _is_synthetic_user_message(self, content: str) -> bool:
        text = (content or "").strip()
        if self._is_tool_output_user_message(text):
            return True
        if text.startswith("[Compacted context from conversation "):
            return True
        return False

    def _should_auto_compact(self) -> bool:
        if not self.messages:
            return False
        msg_limit = AUTO_COMPACT_MIN_MESSAGES + (self.compact_extension_level * AUTO_COMPACT_EXTEND_MESSAGES)
        char_limit = AUTO_COMPACT_MAX_CHARS + (self.compact_extension_level * AUTO_COMPACT_EXTEND_CHARS)
        over_messages = len(self.messages) >= msg_limit
        over_chars = self._message_chars() >= char_limit
        if not (over_messages or over_chars):
            return False
        turns_since_compact = self._user_turn_count() - self.last_compact_user_turn
        return turns_since_compact >= AUTO_COMPACT_COOLDOWN_USER_TURNS

    def _is_no_compact_response(self, compacted: str) -> bool:
        text = (compacted or "").strip().lower()
        if not text:
            return False
        if text.startswith("no_compact"):
            return True
        if "all content is important" in text:
            return True
        return False

    def _is_bad_compaction(self, compacted: str, latest_goal: str) -> bool:
        text = (compacted or "").strip().lower()
        if not text:
            return True
        bad_markers = (
            "no active task",
            "task is complete",
            "completed task",
            "nothing to do",
            "waiting for a new task",
        )
        if any(marker in text for marker in bad_markers):
            return True
        goal = (latest_goal or "").strip().lower()
        if goal and len(goal) >= 8 and goal not in text:
            return True
        return False

    def _compact_conversation(self):
        if not self.messages:
            return

        old_id = self.conversation_id
        system_message = self.messages[0] if self.messages[0].get("role") == "system" else None
        if not system_message:
            return

        latest_goal = self._latest_substantive_user_goal()
        lines = []
        for m in self.messages:
            role = m.get("role", "unknown")
            if role == "system":
                continue
            content = m.get("content", "")
            if role == "user" and self._is_tool_output_user_message(content):
                role_label = "TOOL_OUTPUT"
            elif role == "user" and content.startswith("[Compacted context from conversation "):
                role_label = "COMPACTED_CONTEXT"
            else:
                role_label = role.upper()
            lines.append(f"{role_label}:\n{content}")
        transcript = "\n\n".join(lines)

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

        if self._is_no_compact_response(compacted) or self._is_bad_compaction(compacted, latest_goal):
            self.compact_extension_level = min(
                self.compact_extension_level + 1,
                AUTO_COMPACT_MAX_EXTENSIONS,
            )
            self.last_compact_user_turn = self._user_turn_count()
            self._persist()
            msg_limit = AUTO_COMPACT_MIN_MESSAGES + (self.compact_extension_level * AUTO_COMPACT_EXTEND_MESSAGES)
            char_limit = AUTO_COMPACT_MAX_CHARS + (self.compact_extension_level * AUTO_COMPACT_EXTEND_CHARS)
            print_state(
                "Auto-compact deferred: all content marked important. "
                f"New thresholds -> messages>={msg_limit}, chars>={char_limit}."
            )
            return

        self.conversation_id = self.store.next_branch_id(old_id)
        compacted_messages = [
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
        self.messages.clear()
        self.messages.extend(compacted_messages)
        self.compact_extension_level = 0
        self.last_compact_user_turn = self._user_turn_count()
        self._persist()
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
            self._persist()
            self.conversation_id = self.store.next_root_id()
            self.messages = []
            self.last_compact_user_turn = 0
            self.compact_extension_level = 0
            print_state(f"\nStarted new conversation {self.conversation_id}.\n")
            first = input(print_user()).strip()
            if first and not self._is_done_input(first):
                self._init_messages(first)
            return True

        elif cmd == "/list":
            files = self.store.list_ids()
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
            path = self.store.path(conv_id)
            if not os.path.exists(path):
                print_error(f"\nConversation '{conv_id}' not found.\n")
                return True
            with open(path) as f:
                self.messages = json.load(f)
            self.conversation_id = conv_id
            self.last_compact_user_turn = self._user_turn_count()
            self.compact_extension_level = 0
            self._refresh_model_from_history()
            print_state(f"\nLoaded conversation {conv_id}.\n")
            return True

        return False

    def _init_messages(self, user_input: str):
        if not self.conversation_id:
            self.conversation_id = self.store.next_root_id()
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

    def _persist(self):
        if not self.conversation_id:
            return
        self.store.save(self.conversation_id, json.dumps(self.messages, indent=2))

    def _wait_for_user_input(self, message: str) -> str | None:
        if message:
            print_state(f"[Pause] {message}")
        while True:
            user_input = input(print_user()).strip()
            if not user_input:
                continue
            if self._is_done_input(user_input):
                return None
            if user_input.startswith("/"):
                if self.handle_command(user_input):
                    if not self.messages:
                        return None
                    continue
            return user_input

    def _pause_for_user_input(self, message: str):
        user_input = self._wait_for_user_input(message)
        if user_input is None:
            return False
        self._update_model_for_user_input(user_input)
        self.messages.append({"role": "user", "content": user_input})
        self._persist()
        return True

    def _ingest_user_input(self, user_input: str) -> str:
        self._update_model_for_user_input(user_input)
        self.messages.append({"role": "user", "content": user_input})
        self._persist()
        return "continue"

    def _attach_conversation_to_module_result(self, module_result: dict) -> dict:
        module_result["conversation_id"] = self.conversation_id
        return module_result

    def conversation_loop(self) -> dict:
        runtime = ConversationRuntime(self, self.messages, self._persist)
        result = runtime.run_interactive_loop(
            model_getter=lambda: self.current_model,
            label="Assistant:",
            label_color=_YELLOW,
            fn_color=_CYAN,
            hide_fn_calls=True,
            include_called_module=True,
            on_before_turn=self._maybe_auto_compact,
            on_user_input=self._ingest_user_input,
            on_module_result=self._attach_conversation_to_module_result,
            command_handler=self.handle_command,
            is_done_input=self._is_done_input,
            is_done_response=lambda raw: raw.lower() == "done",
            rate_limit_pause_message="Wait a few minutes, then tell me to continue.",
            interrupt_pause_message="Output interrupted (ESC). What should I do next?",
            completion_output="Assistant session completed.",
        )
        self._persist()
        return result

    def run(self, data) -> dict:
        initial_input = (data.get("input") or "").strip()
        if self._is_done_input(initial_input):
            return self.complete("Assistant session completed.")

        requested_conversation_id = data.get("conversation_id")
        if requested_conversation_id:
            path = self.store.path(requested_conversation_id)
            if os.path.exists(path):
                with open(path) as f:
                    self.messages = json.load(f)
                self.conversation_id = requested_conversation_id
                self.last_compact_user_turn = self._user_turn_count()
                self.compact_extension_level = 0
                self._refresh_model_from_history()
                user_input = initial_input
                if user_input:
                    self._update_model_for_user_input(user_input)
                    self.messages.append({"role": "user", "content": user_input})
                    self._persist()
                return self.conversation_loop()

        self._init_messages(data["input"])
        return self.conversation_loop()

    def resume(self, result) -> dict:
        self.conversation_id = result.get("conversation_id", self.conversation_id)
        called_module = result.get("called_module", "module")
        if not self.conversation_id:
            ids = self.store.list_ids()
            if ids:
                self.conversation_id = ids[-1]
            else:
                return self.fail("No assistant conversation found to resume.")

        with open(self.store.path(self.conversation_id)) as f:
            self.messages = json.load(f)

        self._refresh_model_from_history()
        self.messages.append(
            {
                "role": "user",
                "content": (
                    f"[TOOL OUTPUT - assistant ran {called_module}]\n"
                    f"{result['output']}"
                ),
            }
        )
        wait_payload = parse_wait_signal(result.get("output", ""))
        if wait_payload:
            self._persist()
            user_input = self._wait_for_user_input(
                wait_payload.get("message", "Module requested user input before continuing.")
            )
            if user_input is None:
                return self.complete("Assistant session completed.")
            if should_resume_paused_module(user_input, wait_payload):
                resume_payload = {
                    "module": called_module,
                    "_resume": True,
                    "resume_input": user_input,
                    "called_module": called_module,
                }
                for source in (result, wait_payload):
                    for key, value in source.items():
                        if self._is_conversation_key(key) and isinstance(value, str):
                            resume_payload[key] = value
                return resume_payload
            self._update_model_for_user_input(user_input)
            self.messages.append({"role": "user", "content": user_input})
            self._persist()
        return self.conversation_loop()
