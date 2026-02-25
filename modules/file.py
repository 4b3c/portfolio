import json
import os
from modules.module import Module
from utils.claude import call_claude
from utils.prompts import load_system_prompt

SUMMARY_THRESHOLD = 1000


class FileModule(Module):
    """Read, write, create, or list files on disk.

    Input: JSON with 'action' in {'list','read','new','write'}, plus 'path' and
    optional 'content'/'full'. 'list' walks the project tree (excluding hidden
    dirs, __pycache__, and versions). 'read' summarizes large files unless
    full=true. 'new' fails if the target exists. 'write' overwrites the target.
    """

    def run(self, data) -> dict:
        try:
            raw = data["input"]
            params = json.loads(raw) if raw.strip().startswith("{") else {}
            action = params.get("action", "list")
            path = os.path.realpath(params["path"]) if "path" in params else None
        except (json.JSONDecodeError, KeyError) as e:
            return self.fail(f"Invalid input: {e}")

        if action == "list":
            try:
                files = []
                for root, dirs, filenames in os.walk("."):
                    dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("__pycache__", "versions")]
                    for filename in filenames:
                        files.append(os.path.join(root, filename))
                return self.complete("\n".join(sorted(files)))
            except Exception as e:
                return self.fail(str(e))

        elif action == "read":
            if not path:
                return self.fail("'path' is required for read.")
            full = params.get("full", False)
            try:
                with open(path) as f:
                    content = f.read()
                if not full and len(content) > SUMMARY_THRESHOLD:
                    messages = [
                        {"role": "system", "content": load_system_prompt("summarizer.md")},
                        {"role": "user", "content": content}
                    ]
                    summary = call_claude(messages).strip()
                    return self.complete(f"[Summary of {os.path.relpath(path)}]:\n{summary}")
                return self.complete(content)
            except FileNotFoundError:
                return self.fail(f"File not found: {path}")
            except Exception as e:
                return self.fail(str(e))

        elif action == "new":
            if not path:
                return self.fail("'path' is required for new.")
            if os.path.exists(path):
                return self.fail(f"File already exists: {path}. Use action 'write' to overwrite or the code module to edit.")
            try:
                content = params.get("content", "")
                parent = os.path.dirname(path)
                if parent:
                    os.makedirs(parent, exist_ok=True)
                with open(path, "w") as f:
                    f.write(content)
                return self.complete(f"Created {path}.")
            except Exception as e:
                return self.fail(str(e))

        elif action == "write":
            if not path:
                return self.fail("'path' is required for write.")
            try:
                content = params.get("content", "")
                parent = os.path.dirname(path)
                if parent:
                    os.makedirs(parent, exist_ok=True)
                with open(path, "w") as f:
                    f.write(content)
                return self.complete(f"Written to {path}.")
            except Exception as e:
                return self.fail(str(e))

        else:
            return self.fail(f"Unknown action: {action}. Use 'list', 'read', 'new', or 'write'.")
