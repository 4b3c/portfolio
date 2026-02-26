import json
import os
from tools.tool import Tool
from utils.claude import OPUS
from utils.colors import print_error, _RED
from utils.conversation import (
    ConversationRuntime,
    ConversationStore,
)
from utils.prompts import load_system_prompt
from utils.session import state_path, trace_path
from utils.tool_docs import (
    build_prompt_tool_context,
    enforce_tool_docs_requirement,
)

def save_state(messages, failure_conversation_id: str | None, documented_tools: list[str] | None = None):
    path = state_path("failure_state.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(
            {
                "messages": messages,
                "failure_conversation_id": failure_conversation_id,
                "documented_tools": documented_tools or [],
            },
            f,
            indent=2,
        )


def load_state():
    with open(state_path("failure_state.json")) as f:
        payload = json.load(f)
    # Backward-compat: old state was a raw list of messages.
    if isinstance(payload, list):
        return {"messages": payload, "failure_conversation_id": None}
    return payload


class FailureTool(Tool):
    """Diagnose runtime failures from the active session trace and recover via tool calls.

    Runs an OPUS-guided loop with persisted conversation/state under the current
    session so diagnosis can resume after nested tool calls or restarts.

    Can be invoked manually with a description of what to diagnose or fix,
    or auto-triggered with an error message from a failed tool.

    Input contract: `data["input"]` is a plain text string describing the issue.
    Can be auto-triggered by runtime errors or called manually.
    """

    def __init__(self, registry=None):
        super().__init__(registry)
        self.store = ConversationStore("failure")
        self.messages = []
        self.failure_conversation_id = None
        self.documented_tools = set()

    def _persist(self):
        save_state(
            self.messages,
            self.failure_conversation_id,
            sorted(self.documented_tools),
        )
        if self.failure_conversation_id:
            self.store.save(self.failure_conversation_id, json.dumps(self.messages, indent=2))

    def _loop(self) -> dict:
        runtime = ConversationRuntime(self, self.messages, self._persist)

        def on_tool_result(tool_result: dict) -> dict:
            enforcement = enforce_tool_docs_requirement(
                tool_result,
                registry=self.registry,
                documented_tools=self.documented_tools,
            )
            if enforcement is not None:
                return enforcement
            tool_result["failure_conversation_id"] = self.failure_conversation_id
            return tool_result

        def on_assistant_text(raw: str) -> dict | str:
            if raw.lower() == "done":
                return {"output": "Failure diagnosis complete."}
            return "Continue your diagnosis."

        result = runtime.run_autonomous_loop(
            model=OPUS,
            label="Failure:",
            label_color=_RED,
            hide_fn_calls=True,
            include_called_tool=True,
            ensure_user_turn_if_needed="Continue your diagnosis.",
            continue_user_text=None,
            on_tool_result=on_tool_result,
            on_assistant_text=on_assistant_text,
            pause_tool_name="failure",
            pause_conversation_key="failure_conversation_id",
            pause_conversation_id=self.failure_conversation_id,
        )

        if "error" in result:
            return self.fail(f"Failure tool error: {result['error']}")
        return result

    def run(self, data) -> dict:
        user_input = self.input_text(data)
        manual = data.get("manual", False)

        trace_content = ""
        try:
            with open(trace_path()) as f:
                trace = json.load(f)
            trace_content = json.dumps(trace, indent=2)
        except (FileNotFoundError, json.JSONDecodeError):
            trace_content = "(no trace available)"

        tools_json = build_prompt_tool_context(self.registry)
        system_prompt = load_system_prompt("failure.md", {"AVAILABLE_TOOLS_JSON": tools_json})
        self.documented_tools = set()

        if manual:
            user_message = (
                f"I need help diagnosing/fixing the following:\n{user_input}"
                f"\n\nExecution trace for context:\n{trace_content}"
            )
            label = "\n[Failure tool activated — analyzing request...]\n"
        else:
            user_message = (
                f"A failure occurred:\n{user_input}"
                f"\n\nExecution trace:\n{trace_content}"
            )
            label = "\n[Failure tool activated — diagnosing...]\n"

        self.messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ]
        self.failure_conversation_id = self.store.next_root_id()
        self._persist()

        print_error(label)
        return self._loop()

    def resume(self, result) -> dict:
        # Always reload messages from file to avoid stale state
        try:
            state = load_state()
            self.messages = state.get("messages", [])
            self.failure_conversation_id = (
                result.get("failure_conversation_id")
                or state.get("failure_conversation_id")
                or self.failure_conversation_id
            )
            self.documented_tools = set(state.get("documented_tools", []))
        except FileNotFoundError:
            pass
        if not self.failure_conversation_id:
            ids = self.store.list_ids()
            if ids:
                self.failure_conversation_id = ids[-1]

        if result.get("_resume"):
            user_input = (result.get("resume_input") or "").strip() or "Continue your diagnosis."
            self.messages.append({"role": "user", "content": user_input})
            self._persist()
            return self._loop()

        called_tool = result.get("called_tool", "tool")
        self.messages.append(
            {
                "role": "user",
                "content": (
                    f"[TOOL OUTPUT - failure ran {called_tool}]\n"
                    f"{result['output']}"
                ),
            }
        )
        self._persist()
        return self._loop()
