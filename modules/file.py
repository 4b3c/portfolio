import json
import os
import zipfile
from time import time
from modules.module import Module
from utils.claude import call_claude

SUMMARY_THRESHOLD = 1000

PROTECTED_FILES = {
    "zipper.py",
    "modules/interface.py",
    "modules/assistant.py",
    "modules/file.py",
}

VERSIONS_PATH = "data/versions"


def is_protected(path: str) -> bool:
    rel = os.path.relpath(os.path.realpath(path), os.path.realpath("."))
    return rel in PROTECTED_FILES


def create_version_zip():
    os.makedirs(VERSIONS_PATH, exist_ok=True)
    version = str(int(time()))
    zip_path = f"{VERSIONS_PATH}/{version}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, filenames in os.walk("."):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__"]
            for filename in filenames:
                filepath = os.path.join(root, filename)
                zf.write(filepath)
    return zip_path


class FileModule(Module):
    """Read, write, or list files on disk. Input: JSON with 'action' (list/read/write), 'path', and optionally 'content' for writes. If no input is given, lists all project files. Certain core files are protected and cannot be written."""

    def run(self, data) -> dict:
        try:
            params = json.loads(data["input"]) if data["input"].strip().startswith("{") else {}
            action = params.get("action", "list")
            path = os.path.realpath(params["path"]) if "path" in params else None
        except (json.JSONDecodeError, KeyError) as e:
            return self.fail(f"Invalid input: {e}")

        if action == "list":
            try:
                files = []
                for root, dirs, filenames in os.walk("."):
                    dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__"]
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
                        {"role": "system", "content": "You are a concise summarizer. Summarize the given file contents clearly and briefly, preserving the key information."},
                        {"role": "user", "content": content}
                    ]
                    summary = call_claude(messages).strip()
                    return self.complete(f"[Summary of {os.path.relpath(path)}]:\n{summary}")
                return self.complete(content)
            except FileNotFoundError:
                return self.fail(f"File not found: {path}")
            except Exception as e:
                return self.fail(str(e))

        elif action == "write":
            if not path:
                return self.fail("'path' is required for write.")
            if is_protected(path):
                return self.fail(f"'{os.path.relpath(path)}' is a protected file and cannot be modified.")
            try:
                zip_path = create_version_zip()
                content = params.get("content", "")
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w") as f:
                    f.write(content)
                return self.complete(f"Version saved to {zip_path}. Written to {path}.")
            except Exception as e:
                return self.fail(str(e))

        else:
            return self.fail(f"Unknown action: {action}. Use 'list', 'read', or 'write'.")
