import json
import os
import re
from datetime import datetime
from modules.module import Module
from utils.claude import OPUS, call_claude
from utils.function_calls import maybe_dispatch_module_call
from utils.prompts import load_system_prompt

PLANS_ROOT = "data/plans"
PLANNER_STATE_PATH = "data/planner_state.json"


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


def save_state(messages, pending_plan):
    os.makedirs("data", exist_ok=True)
    with open(PLANNER_STATE_PATH, "w") as f:
        json.dump({"messages": messages, "pending_plan": pending_plan}, f, indent=2)


def load_state():
    with open(PLANNER_STATE_PATH) as f:
        return json.load(f)


class PlannerModule(Module):
    """Create and manage execution plans. Input: JSON with action in {'create','view','list','update'}. 'create' requires 'objective' and optional 'name'/'context'; planner may call other modules to gather codebase context before writing data/plans/<short-name>/PLAN.md, then returns WAIT_FOR_USER_INPUT so the assistant pauses for user confirmation. 'view' requires 'plan'. 'update' requires 'plan' and supports status/notes. 'list' returns known plans."""

    def __init__(self, registry=None):
        super().__init__(registry)
        self.messages = []
        self.pending_plan = None

    def run(self, data) -> dict:
        raw = data["input"]
        try:
            params = json.loads(raw) if isinstance(raw, str) and raw.strip().startswith("{") else {"action": "create", "objective": raw}
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
            except FileNotFoundError:
                return self.fail("Planner state not found; cannot resume.")

        called_module = result.get("called_module", "module")
        self.messages.append({"role": "user", "content": f"[{called_module} output]: {result['output']}"})
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

        modules_json = json.dumps({k: v for k, v in self.registry.items() if k != "planner"}, indent=2)
        self.messages = [
            {
                "role": "system",
                "content": load_system_prompt("planner_create.md", {"AVAILABLE_MODULES_JSON": modules_json}),
            },
            {"role": "user", "content": user_prompt},
        ]
        self.pending_plan = {
            "objective": objective,
            "short_name": short_name,
            "plan_dir": plan_dir,
        }
        return self._create_loop()

    def _create_loop(self) -> dict:
        if self.messages and self.messages[-1]["role"] == "assistant":
            self.messages.append({"role": "user", "content": "Continue planning."})

        try:
            while True:
                raw = call_claude(self.messages, model=OPUS, temperature=0.2).strip()
                self.messages.append({"role": "assistant", "content": raw})

                module_result = maybe_dispatch_module_call(self, raw, include_called_module=True)
                if module_result:
                    save_state(self.messages, self.pending_plan)
                    return module_result

                return self._finalize_plan(raw)
        except Exception as e:
            return self.fail(f"Plan generation failed: {e}")

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
        if os.path.exists(PLANNER_STATE_PATH):
            os.remove(PLANNER_STATE_PATH)

        payload = {
            "signal": "WAIT_FOR_USER_INPUT",
            "wait_for_user_input": True,
            "message": "Plan created. Present the plan summary and wait for the user before continuing.",
            "plan_name": meta["name"],
            "plan_dir": plan_dir,
            "plan_file": plan_path,
        }
        return self.complete(json.dumps(payload, indent=2))

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
