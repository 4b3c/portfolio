import json
import os
from modules.module import Module
from utils.claude import OPUS, ClaudeRateLimitPause
from utils.colors import print_error, _RED
from utils.conversation import ConversationStore, stream_response
from utils.function_calls import contains_function_call_markup, maybe_dispatch_module_call
from utils.prompts import load_system_prompt
from utils.session import state_path, trace_path

def save_state(messages, failure_conversation_id: str | None):
    path = state_path("failure_state.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(
            {
                "messages": messages,
                "failure_conversation_id": failure_conversation_id,
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


class FailureModule(Module):
    """Diagnose runtime failures from the active session trace and recover via module calls.

    Runs an OPUS-guided loop with persisted conversation/state under the current
    session so diagnosis can resume after nested module calls or restarts.
    """

    def __init__(self, registry=None):
        super().__init__(registry)
        self.store = ConversationStore("failure")
        self.messages = []
        self.failure_conversation_id = None

    def _persist(self):
        save_state(self.messages, self.failure_conversation_id)
        if self.failure_conversation_id:
            self.store.save(self.failure_conversation_id, json.dumps(self.messages, indent=2))

    def _loop(self) -> dict:
        try:
            # Defensive: ensure messages end with user before calling Claude
            if self.messages and self.messages[-1]["role"] == "assistant":
                self.messages.append({"role": "user", "content": "Continue your diagnosis."})
                self._persist()

            while True:
                raw = stream_response(self.messages, OPUS, "Failure:", _RED, hide_fn_calls=True)
                self.messages.append({"role": "assistant", "content": raw})
                self._persist()

                module_result = maybe_dispatch_module_call(self, raw, include_called_module=True)
                if module_result:
                    module_result["failure_conversation_id"] = self.failure_conversation_id
                    self._persist()
                    return module_result
                if contains_function_call_markup(raw):
                    print_error(
                        "Malformed function call:",
                        "Ignored XML call markup because it was not a single valid top-level call.",
                    )

                if raw.lower() == "done":
                    break

                self.messages.append({"role": "user", "content": "Continue your diagnosis."})
                self._persist()

            return self.complete("Failure diagnosis complete.")
        except ClaudeRateLimitPause as e:
            payload = {
                "signal": "WAIT_FOR_USER_INPUT",
                "wait_for_user_input": True,
                "message": "Claude rate limit hit in failure module. Wait a few minutes, then tell me to continue.",
                "failure_conversation_id": self.failure_conversation_id,
                "error": str(e),
            }
            self._persist()
            return self.complete(json.dumps(payload, indent=2))
        except Exception as e:
            return self.fail(f"Failure module error: {e}")

    def run(self, data) -> dict:
        error = data["input"]

        with open(trace_path()) as f:
            trace = json.load(f)
        modules_json = json.dumps(self.registry, indent=2)
        system_prompt = load_system_prompt("failure.md", {"AVAILABLE_MODULES_JSON": modules_json})

        self.messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"A failure occurred:\n{error}\n\nExecution trace:\n{json.dumps(trace, indent=2)}"}
        ]
        self.failure_conversation_id = self.store.next_root_id()
        self._persist()

        print_error("\n[Failure module activated — diagnosing...]\n")
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
        except FileNotFoundError:
            pass
        if not self.failure_conversation_id:
            ids = self.store.list_ids()
            if ids:
                self.failure_conversation_id = ids[-1]

        called_module = result.get("called_module", "module")
        self.messages.append(
            {
                "role": "user",
                "content": (
                    f"[TOOL OUTPUT - failure ran {called_module}]\n"
                    f"{result['output']}"
                ),
            }
        )
        self._persist()
        return self._loop()
