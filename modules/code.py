import json
import os
from modules.module import Module

class CodeModule(Module):
    """Make targeted edits to existing files using search/replace. Use this to modify any file — prefer this over rewriting the whole file. Input: JSON with 'path' (file to edit), 'old' (exact string to find — must match whitespace and indentation precisely), and 'new' (replacement string). Fails if 'old' is not found or matches more than once — make it more specific if needed."""

    def run(self, data) -> dict:
        try:
            params = json.loads(data["input"])
            path = params["path"]
            old = params["old"]
            new = params["new"]
        except (json.JSONDecodeError, KeyError) as e:
            return self.fail(f"Invalid input: {e}. Expected JSON with 'path', 'old', and 'new'.")

        full_path = os.path.realpath(os.path.expanduser(path))

        try:
            with open(full_path) as f:
                content = f.read()
        except FileNotFoundError:
            return self.fail(f"File not found: {path}")
        except Exception as e:
            return self.fail(str(e))

        if old not in content:
            return self.fail(f"Search string not found in {path}. Make sure 'old' matches the file contents exactly, including whitespace and indentation.")

        count = content.count(old)
        if count > 1:
            return self.fail(f"Search string found {count} times in {path}. Make 'old' more specific so it matches exactly one location.")

        updated = content.replace(old, new, 1)

        try:
            with open(full_path, "w") as f:
                f.write(updated)
        except Exception as e:
            return self.fail(str(e))

        return self.complete(f"Replaced in {path}.")
