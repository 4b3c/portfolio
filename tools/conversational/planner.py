import json
import os
import re
from datetime import datetime
from tools.tool import Tool
from utils.claude import OPUS
from utils.colors import print_state, _MAGENTA
from utils.conversation import (
    ConversationRuntime,
    ConversationStore,
)
from utils.prompts import load_system_prompt
from utils.session import state_path
from utils.tool_docs import (
    build_prompt_tool_context,
    enforce_tool_docs_requirement,
)

PLANS_ROOT = "data/plans"
MAX_PLANNER_MODULE_CALLS = 6
PLANNER_MODEL_TIMEOUT_SECONDS = 90
PLANNER_MAX_TURNS = 8
PLANNER_MAX_TOKENS_PER_CALL = 1800


def _slugify(text: str, max_words: int = 4, max_len: int = 40) -> str:
    words = re.findall(r"[A-Za-z0-9]+", (text or "").lower())[:max_words]
    slug = "-".join(words).strip("-")
    if not slug:
        slug = "plan"
    return slug[:max_len].strip("-")


def _unique_plan_dir(base_slug: str) -> str:
    candidate = os.path.join(PLANS_ROOT, base_slug)
    if not os.path.exists(candidate):
        return candidate
    i = 2
    while True:
        path = os.path.join(PLANS_ROOT, f"{base_slug}-{i}")
        if not os.path.exists(path):
            return path
        i += 1


def save_state(messages, pending_plan, planner_conversation_id, documented_tools: list[str] | None = None):
    path = state_path("planner_state.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(
            {
                "messages": messages,
                "pending_plan": pending_plan,
                "planner_conversation_id": planner_conversation_id,
                "documented_tools": documented_tools or [],
            },
            f,
            indent=2,
        )


def load_state():
    with open(state_path("planner_state.json")) as f:
        return json.load(f)


class PlannerTool(Tool):
    """Create and manage plans with persisted planner conversations.

    Input contract: `data["input"]` is a JSON object/string with `action`
    in {'create','view','list','update'}.
    - create: requires 'objective', optional 'name'/'context'; may gather focused
      context via tool calls, writes `data/plans/<short-name>/PLAN.md`, then
      returns WAIT_FOR_USER_INPUT.
    - view: requires 'plan'.
    - update: requires 'plan', supports status/notes.
    - list: returns known plans.
    """

    def __init__(self, registry=None):
        super().__init__(registry)
        self.store = ConversationStore("planner")
        self.messages = []
        self.pending_plan = None
        self.planner_conversation_id = None
        self.documented_tools = set()

    def run(self, data) -> dict:
        raw = self.input_text(data)
        try:
            params = self.input_json(data, fallback={"action": "create", "objective": raw})
        except json.JSONDecodeError as e:
            return self.fail(f"Invalid JSON input: {e}")

        action = params.get("action", "create")
        if action == "create":
            return self._create_plan(params)
        if action == "list":
            return self._list_plans()
        if action == "view":
            return self._view_plan(params)
        if action == "update":
            return self._update_plan(params)
        return self.fail("Unknown action. Use one of: create, list, view, update.")

    def resume(self, result) -> dict:
        if not self.messages or not self.pending_plan:
            try:
                state = load_state()
                self.messages = state.get("messages", [])
                self.pending_plan = state.get("pending_plan")
                self.planner_conversation_id = state.get("planner_conversation_id")
                self.documented_tools = set(state.get("documented_tools", []))
            except FileNotFoundError:
                return self.fail("Planner state not found; cannot resume.")

        called_tool = result.get("called_tool", "tool")
        self.messages.append({"role": "user", "content": f"[{called_tool} output]: {result['output']}"})
        self._persist()
        return self._create_loop()

    def _create_plan(self, params: dict) -> dict:
        objective = (params.get("objective") or "").strip()
        if not objective:
            return self.fail("'objective' is required for action='create'.")

        provided_name = (params.get("name") or "").strip()
        short_name = _slugify(provided_name or objective)
        context = (params.get("context") or "").strip()

        os.makedirs(PLANS_ROOT, exist_ok=True)
        plan_dir = _unique_plan_dir(short_name)
        os.makedirs(plan_dir, exist_ok=True)

        user_prompt = f"Objective:\n{objective}"
        if context:
            user_prompt += f"\n\nContext:\n{context}"

        tools_json = build_prompt_tool_context(self.registry, exclude={"planner"})
        self.documented_tools = set()
        self.messages = [
            {
                "role": "system",
                "content": load_system_prompt("planner_create.md", {"AVAILABLE_TOOLS_JSON": tools_json}),
            },
            {"role": "user", "content": user_prompt},
        ]
        self.planner_conversation_id = self.store.next_root_id()
        self.pending_plan = {
            "objective": objective,
            "short_name": short_name,
            "plan_dir": plan_dir,
            "tool_calls": 0,
            "planner_conversation_id": self.planner_conversation_id,
        }
        self._persist()
        print_state(f"[Planner] Creating plan '{os.path.basename(plan_dir)}' with OPUS...")
        return self._create_loop()

    def _create_loop(self) -> dict:
        runtime = ConversationRuntime(self, self.messages, self._persist)

        def on_tool_result(tool_result: dict) -> dict:
            enforcement = enforce_tool_docs_requirement(
                tool_result,
                registry=self.registry,
                documented_tools=self.documented_tools,
            )
            if enforcement is not None:
                return enforcement
            call_count = int(self.pending_plan.get("tool_calls", 0))
            if call_count >= MAX_PLANNER_MODULE_CALLS:
                print_state("[Planner] Tool call budget reached; forcing plan finalization.")
                return {
                    "_continue_loop": True,
                    "user_message": (
                        "Stop calling tools. Use the context already gathered and output the final "
                        "plan markdown now."
                    ),
                }
            self.pending_plan["tool_calls"] = call_count + 1
            print_state(f"[Planner] Gathering context via tool: {tool_result.get('tool')}")
            tool_result["planner_conversation_id"] = self.planner_conversation_id
            self._persist()
            return tool_result

        def on_assistant_text(raw: str) -> dict:
            print_state("[Planner] Finalizing plan document.")
            return self._finalize_plan(raw)

        result = runtime.run_autonomous_loop(
            model=OPUS,
            label="Planner:",
            label_color=_MAGENTA,
            hide_fn_calls=True,
            timeout=PLANNER_MODEL_TIMEOUT_SECONDS,
            max_tokens=PLANNER_MAX_TOKENS_PER_CALL,
            include_called_tool=True,
            max_turns=PLANNER_MAX_TURNS,
            ensure_user_turn_if_needed="Continue planning.",
            continue_user_text=None,
            on_tool_result=on_tool_result,
            on_assistant_text=on_assistant_text,
            pause_tool_name="planner",
            pause_conversation_key="planner_conversation_id",
            pause_conversation_id=self.planner_conversation_id,
        )
        if "error" in result:
            return self.fail(
                f"Planner exceeded max turns ({PLANNER_MAX_TURNS}). Try a narrower objective."
            )
        return result

    def _finalize_plan(self, plan_markdown: str) -> dict:
        if not self.pending_plan:
            return self.fail("No active plan creation state.")

        plan_dir = self.pending_plan["plan_dir"]
        objective = self.pending_plan["objective"]
        plan_path = os.path.join(plan_dir, "PLAN.md")
        meta_path = os.path.join(plan_dir, "meta.json")
        created_at = datetime.utcnow().isoformat() + "Z"
        meta = {
            "name": os.path.basename(plan_dir),
            "objective": objective,
            "status": "awaiting_user_input",
            "created_at": created_at,
            "updated_at": created_at,
            "plan_path": plan_path,
            "notes": [],
        }

        try:
            with open(plan_path, "w") as f:
                f.write(plan_markdown + "\n")
            with open(meta_path, "w") as f:
                json.dump(meta, f, indent=2)
        except Exception as e:
            return self.fail(f"Failed to save plan files: {e}")

        self.messages = []
        self.pending_plan = None
        state_file = state_path("planner_state.json")
        if os.path.exists(state_file):
            os.remove(state_file)

        payload = {
            "signal": "WAIT_FOR_USER_INPUT",
            "wait_for_user_input": True,
            "message": "Plan created. Present the plan summary and wait for the user before continuing.",
            "plan_name": meta["name"],
            "plan_dir": plan_dir,
            "plan_file": plan_path,
            "planner_conversation_id": self.planner_conversation_id,
            "planner_conversation_file": self.store.path(self.planner_conversation_id),
        }
        print_state(f"[Planner] Plan ready: {plan_path} (waiting for user input)")
        return self.complete(json.dumps(payload, indent=2))

    def _persist(self):
        save_state(
            self.messages,
            self.pending_plan,
            self.planner_conversation_id,
            sorted(self.documented_tools),
        )
        if self.planner_conversation_id:
            self.store.save(self.planner_conversation_id, json.dumps(self.messages, indent=2))

    def _list_plans(self) -> dict:
        if not os.path.exists(PLANS_ROOT):
            return self.complete("[]")

        plans = []
        for entry in sorted(os.listdir(PLANS_ROOT)):
            plan_dir = os.path.join(PLANS_ROOT, entry)
            if not os.path.isdir(plan_dir):
                continue
            meta_path = os.path.join(plan_dir, "meta.json")
            if os.path.exists(meta_path):
                try:
                    with open(meta_path) as f:
                        plans.append(json.load(f))
                except Exception:
                    plans.append({"name": entry, "status": "unknown"})
            else:
                plans.append({"name": entry, "status": "unknown"})
        return self.complete(json.dumps(plans, indent=2))

    def _view_plan(self, params: dict) -> dict:
        plan = (params.get("plan") or "").strip()
        if not plan:
            return self.fail("'plan' is required for action='view'.")

        plan_path = os.path.join(PLANS_ROOT, plan, "PLAN.md")
        if not os.path.exists(plan_path):
            return self.fail(f"Plan not found: {plan}")
        try:
            with open(plan_path) as f:
                return self.complete(f.read())
        except Exception as e:
            return self.fail(f"Failed to read plan: {e}")

    def _update_plan(self, params: dict) -> dict:
        plan = (params.get("plan") or "").strip()
        if not plan:
            return self.fail("'plan' is required for action='update'.")

        meta_path = os.path.join(PLANS_ROOT, plan, "meta.json")
        if not os.path.exists(meta_path):
            return self.fail(f"Plan not found: {plan}")

        try:
            with open(meta_path) as f:
                meta = json.load(f)
        except Exception as e:
            return self.fail(f"Failed to load metadata: {e}")

        status = params.get("status")
        notes = params.get("notes")
        if status:
            meta["status"] = status
        if notes:
            if isinstance(notes, list):
                meta.setdefault("notes", []).extend(str(n) for n in notes)
            else:
                meta.setdefault("notes", []).append(str(notes))
        meta["updated_at"] = datetime.utcnow().isoformat() + "Z"

        try:
            with open(meta_path, "w") as f:
                json.dump(meta, f, indent=2)
        except Exception as e:
            return self.fail(f"Failed to save metadata: {e}")

        return self.complete(json.dumps(meta, indent=2))
