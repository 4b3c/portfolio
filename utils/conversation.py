import json
import os
import re
import select
import sys
import termios
import tty
from typing import Callable
from utils.claude import ClaudeRateLimitPause, call_claude
from utils.colors import LineStream, stream_end, stream_label, print_error, print_state, print_user, _WHITE
from utils.function_calls import contains_function_call_markup, maybe_dispatch_tool_call
from utils.session import conversations_dir

WAIT_SIGNAL = "WAIT_FOR_USER_INPUT"
_CONTINUE_INPUTS = {"continue", "go ahead", "resume", "proceed"}


class ConversationStore:
    """Session-scoped conversation ID/path manager for per-agent transcripts."""

    def __init__(self, kind: str):
        self.kind = kind
        self._id_re = re.compile(rf"^{re.escape(kind)}(\d+)(?:\.(\d+))?$")

    def path(self, conversation_id: str) -> str:
        return os.path.join(conversations_dir(), f"{conversation_id}.json")

    def save(self, conversation_id: str, content: str):
        path = self.path(conversation_id)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(content)

    def list_ids(self) -> list[str]:
        root = conversations_dir()
        if not os.path.exists(root):
            return []
        ids = []
        for name in os.listdir(root):
            if not name.endswith(".json"):
                continue
            cid = name[:-5]
            if self._id_re.match(cid):
                ids.append(cid)
        return sorted(ids, key=self._sort_key)

    def next_root_id(self) -> str:
        ids = self.list_ids()
        max_root = 0
        for cid in ids:
            m = self._id_re.match(cid)
            if not m:
                continue
            max_root = max(max_root, int(m.group(1)))
        return f"{self.kind}{max_root + 1}"

    def next_branch_id(self, current_id: str) -> str:
        m = self._id_re.match(current_id)
        if not m:
            return self.next_root_id()
        root = int(m.group(1))
        max_branch = 0
        for cid in self.list_ids():
            cm = self._id_re.match(cid)
            if not cm or int(cm.group(1)) != root:
                continue
            branch = cm.group(2)
            if branch is not None:
                max_branch = max(max_branch, int(branch))
        return f"{self.kind}{root}.{max_branch + 1}"

    def _sort_key(self, cid: str):
        m = self._id_re.match(cid)
        if not m:
            return (10**9, 10**9)
        root = int(m.group(1))
        branch = int(m.group(2)) if m.group(2) is not None else 0
        return (root, branch)


class UserInterruptPause(RuntimeError):
    """User pressed ESC while streaming output."""


class _EscWatcher:
    def __init__(self):
        self.enabled = False
        self.fd = None
        self._old_settings = None

    def __enter__(self):
        try:
            if not sys.stdin.isatty():
                return self
            self.fd = sys.stdin.fileno()
            self._old_settings = termios.tcgetattr(self.fd)
            tty.setcbreak(self.fd)
            self.enabled = True
        except Exception:
            self.enabled = False
        return self

    def __exit__(self, exc_type, exc, tb):
        if self.enabled and self.fd is not None and self._old_settings is not None:
            try:
                termios.tcsetattr(self.fd, termios.TCSADRAIN, self._old_settings)
            except Exception:
                pass
        self.enabled = False

    def esc_pressed(self) -> bool:
        if not self.enabled or self.fd is None:
            return False
        try:
            ready, _, _ = select.select([self.fd], [], [], 0)
            if not ready:
                return False
            data = os.read(self.fd, 1)
            return data == b"\x1b"
        except Exception:
            return False


class InterruptibleStream:
    """Wrap token callbacks with ESC-to-interrupt behavior."""

    def __init__(self):
        self._watcher = _EscWatcher()

    def __enter__(self):
        self._watcher.__enter__()
        return self

    def __exit__(self, exc_type, exc, tb):
        self._watcher.__exit__(exc_type, exc, tb)

    def wrap(self, on_token):
        def wrapped(token: str):
            on_token(token)
            if self._watcher.esc_pressed():
                raise UserInterruptPause("User interrupted streaming with ESC.")
        return wrapped


def parse_wait_signal(text: str) -> dict | None:
    if not isinstance(text, str):
        return None
    stripped = text.strip()
    if not stripped.startswith("{"):
        return None
    try:
        payload = json.loads(stripped)
    except Exception:
        return None
    if payload.get("signal") == WAIT_SIGNAL or payload.get("wait_for_user_input") is True:
        return payload
    return None


def is_continue_input(user_input: str) -> bool:
    return (user_input or "").strip().lower() in _CONTINUE_INPUTS


def is_rate_limit_wait_payload(payload: dict | None) -> bool:
    if not isinstance(payload, dict):
        return False
    message = str(payload.get("message", "")).lower()
    error = str(payload.get("error", "")).lower()
    text = f"{message} {error}"
    return any(token in text for token in ("rate limit", "too many requests", "429", "overload"))


def should_resume_paused_module(user_input: str, wait_payload: dict | None) -> bool:
    return is_continue_input(user_input) and is_rate_limit_wait_payload(wait_payload)


def rate_limit_wait_payload(
    tool_name: str,
    *,
    conversation_key: str | None = None,
    conversation_id: str | None = None,
    error: str | None = None,
) -> dict:
    payload = {
        "signal": WAIT_SIGNAL,
        "wait_for_user_input": True,
        "message": f"Claude rate limit hit in {tool_name} tool. Wait a few minutes, then tell me to continue.",
    }
    if conversation_key and conversation_id:
        payload[conversation_key] = conversation_id
    if error:
        payload["error"] = error
    return payload


def user_interrupt_wait_payload(
    tool_name: str,
    *,
    conversation_key: str | None = None,
    conversation_id: str | None = None,
) -> dict:
    payload = {
        "signal": WAIT_SIGNAL,
        "wait_for_user_input": True,
        "message": f"{tool_name.capitalize()} output interrupted by user (ESC). Waiting for your next input.",
    }
    if conversation_key and conversation_id:
        payload[conversation_key] = conversation_id
    return payload


def stream_response(
    messages: list[dict],
    model: str,
    label: str,
    label_color: str,
    *,
    fn_color: str | None = None,
    hide_fn_calls: bool = False,
    temperature: float = 0.2,
    timeout: float | None = None,
    max_tokens: int = 8096,
) -> str:
    stream_label(label, label_color)
    ls = LineStream(_WHITE, fn_color=fn_color, hide_fn_calls=hide_fn_calls)
    with InterruptibleStream() as interruptible:
        on_token = interruptible.wrap(ls.token)
        try:
            raw = call_claude(
                messages,
                model=model,
                temperature=temperature,
                timeout=timeout,
                max_tokens=max_tokens,
                on_token=on_token,
            ).strip()
            return raw
        finally:
            ls.flush()
            stream_end()


class ConversationRuntime:
    """Generalized conversation loop runtime for tool-driven agents."""

    def __init__(
        self,
        caller,
        messages: list[dict],
        persist_fn: Callable[[], None],
    ):
        self.caller = caller
        self.messages = messages
        self._persist_fn = persist_fn

    def persist(self):
        self._persist_fn()

    def _sync_messages_from_caller(self):
        caller_messages = getattr(self.caller, "messages", None)
        if isinstance(caller_messages, list) and caller_messages is not self.messages:
            self.messages = caller_messages

    def append(self, role: str, content: str, *, persist: bool = True):
        self._sync_messages_from_caller()
        self.messages.append({"role": role, "content": content})
        if persist:
            self.persist()

    def wait_for_user_input(
        self,
        *,
        prompt_message: str = "",
        is_done_input: Callable[[str], bool] | None = None,
        command_handler: Callable[[str], bool] | None = None,
        exit_if_messages_empty: bool = False,
    ) -> str | None:
        if prompt_message:
            print_state(f"[Pause] {prompt_message}")
        while True:
            user_input = input(print_user()).strip()
            if not user_input:
                continue
            if is_done_input and is_done_input(user_input):
                return None
            if user_input.startswith("/") and command_handler:
                if command_handler(user_input):
                    self._sync_messages_from_caller()
                    if exit_if_messages_empty and not self.messages:
                        return None
                    continue
            return user_input

    def run_turn(
        self,
        *,
        model: str,
        label: str,
        label_color: str,
        fn_color: str | None = None,
        hide_fn_calls: bool = False,
        temperature: float = 0.2,
        timeout: float | None = None,
        max_tokens: int = 8096,
        include_called_tool: bool = False,
    ) -> dict:
        self._sync_messages_from_caller()
        try:
            raw = stream_response(
                self.messages,
                model,
                label,
                label_color,
                fn_color=fn_color,
                hide_fn_calls=hide_fn_calls,
                temperature=temperature,
                timeout=timeout,
                max_tokens=max_tokens,
            )
        except ClaudeRateLimitPause as e:
            return {"pause": "rate_limit", "error": str(e)}
        except UserInterruptPause:
            return {"pause": "interrupt"}

        self.append("assistant", raw, persist=True)
        tool_result = maybe_dispatch_tool_call(self.caller, raw, include_called_tool=include_called_tool)
        if tool_result:
            return {"raw": raw, "tool_result": tool_result}
        if contains_function_call_markup(raw):
            print_error(
                "Malformed function call:",
                "Ignored XML call markup because it was not a single valid top-level call.",
            )
        return {"raw": raw}

    def run_autonomous_loop(
        self,
        *,
        model: str,
        label: str,
        label_color: str,
        fn_color: str | None = None,
        hide_fn_calls: bool = True,
        temperature: float = 0.2,
        timeout: float | None = None,
        max_tokens: int = 8096,
        include_called_tool: bool = False,
        max_turns: int | None = None,
        ensure_user_turn_if_needed: str | None = None,
        continue_user_text: str | Callable[[str], str | None] | None = None,
        on_tool_result: Callable[[dict], dict | str | None] | None = None,
        on_assistant_text: Callable[[str], dict | str | None] | None = None,
        done_check: Callable[[str], bool] | None = None,
        done_output: str | None = None,
        pause_tool_name: str | None = None,
        pause_conversation_key: str | None = None,
        pause_conversation_id: str | None = None,
    ) -> dict:
        if ensure_user_turn_if_needed and self.messages and self.messages[-1].get("role") == "assistant":
            self.append("user", ensure_user_turn_if_needed, persist=True)

        turns = 0
        while True:
            turns += 1
            if max_turns is not None and turns > max_turns:
                return {"error": f"Exceeded max turns ({max_turns})."}

            turn = self.run_turn(
                model=model,
                label=label,
                label_color=label_color,
                fn_color=fn_color,
                hide_fn_calls=hide_fn_calls,
                temperature=temperature,
                timeout=timeout,
                max_tokens=max_tokens,
                include_called_tool=include_called_tool,
            )

            if turn.get("pause") == "rate_limit":
                payload = rate_limit_wait_payload(
                    pause_tool_name or "tool",
                    conversation_key=pause_conversation_key,
                    conversation_id=pause_conversation_id,
                    error=turn.get("error"),
                )
                return {"output": json.dumps(payload, indent=2)}

            if turn.get("pause") == "interrupt":
                payload = user_interrupt_wait_payload(
                    pause_tool_name or "tool",
                    conversation_key=pause_conversation_key,
                    conversation_id=pause_conversation_id,
                )
                return {"output": json.dumps(payload, indent=2)}

            tool_result = turn.get("tool_result")
            if tool_result is not None:
                if on_tool_result:
                    decision = on_tool_result(tool_result)
                    if isinstance(decision, dict) and decision.get("_continue_loop"):
                        user_message = decision.get("user_message")
                        if isinstance(user_message, str) and user_message.strip():
                            self.append("user", user_message, persist=True)
                        continue
                    if isinstance(decision, dict):
                        return decision
                    if isinstance(decision, str):
                        self.append("user", decision, persist=True)
                        continue
                return tool_result

            raw = turn.get("raw", "")
            if on_assistant_text:
                decision = on_assistant_text(raw)
                if isinstance(decision, dict) and decision.get("_continue_loop"):
                    user_message = decision.get("user_message")
                    if isinstance(user_message, str) and user_message.strip():
                        self.append("user", user_message, persist=True)
                    continue
                if isinstance(decision, dict):
                    return decision
                if isinstance(decision, str):
                    self.append("user", decision, persist=True)
                    continue

            if done_check and done_check(raw):
                return {"output": done_output if done_output is not None else raw}

            if continue_user_text is None:
                return {"output": raw}
            next_user = continue_user_text(raw) if callable(continue_user_text) else continue_user_text
            if not next_user:
                return {"output": raw}
            self.append("user", next_user, persist=True)

    def run_interactive_loop(
        self,
        *,
        model_getter: Callable[[], str],
        label: str,
        label_color: str,
        fn_color: str | None = None,
        hide_fn_calls: bool = True,
        temperature: float = 0.2,
        timeout: float | None = None,
        max_tokens: int = 8096,
        include_called_tool: bool = True,
        on_before_turn: Callable[[], None] | None = None,
        on_user_input: Callable[[str], str] | None = None,
        on_tool_result: Callable[[dict], dict] | None = None,
        command_handler: Callable[[str], bool] | None = None,
        is_done_input: Callable[[str], bool] | None = None,
        is_done_response: Callable[[str], bool] | None = None,
        rate_limit_pause_message: str = "Wait a few minutes, then tell me to continue.",
        interrupt_pause_message: str = "Output interrupted (ESC). What should I do next?",
        completion_output: str = "Assistant session completed.",
    ) -> dict:
        while True:
            if on_before_turn:
                on_before_turn()

            turn = self.run_turn(
                model=model_getter(),
                label=label,
                label_color=label_color,
                fn_color=fn_color,
                hide_fn_calls=hide_fn_calls,
                temperature=temperature,
                timeout=timeout,
                max_tokens=max_tokens,
                include_called_tool=include_called_tool,
            )

            pause_type = turn.get("pause")
            if pause_type:
                pause_message = rate_limit_pause_message if pause_type == "rate_limit" else interrupt_pause_message
                user_input = self.wait_for_user_input(
                    prompt_message=pause_message,
                    is_done_input=is_done_input,
                    command_handler=command_handler,
                    exit_if_messages_empty=True,
                )
                if user_input is None:
                    return {"output": completion_output}
                if on_user_input:
                    action = on_user_input(user_input)
                    if action == "break":
                        return {"output": completion_output}
                continue

            tool_result = turn.get("tool_result")
            if tool_result is not None:
                return on_tool_result(tool_result) if on_tool_result else tool_result

            raw = turn.get("raw", "")
            if is_done_response and is_done_response(raw):
                return {"output": completion_output}

            user_input = self.wait_for_user_input(
                is_done_input=is_done_input,
                command_handler=command_handler,
                exit_if_messages_empty=True,
            )
            if user_input is None:
                return {"output": completion_output}

            if on_user_input:
                action = on_user_input(user_input)
                if action == "break":
                    return {"output": completion_output}
