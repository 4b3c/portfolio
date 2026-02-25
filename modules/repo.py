import json
import os
import re
import subprocess
from modules.module import Module

SOURCE_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".go",
    ".rs",
    ".java",
    ".c",
    ".cc",
    ".cpp",
    ".h",
    ".hpp",
}

SKIP_DIRS = {
    ".git",
    ".venv",
    "__pycache__",
    "node_modules",
    "dist",
    "build",
    "data/conversations",
}


class RepoModule(Module):
    """Codebase intelligence for on-the-fly documentation and impact analysis. Input: JSON with 'action' in {'find','symbols','deps','impact'} plus action-specific params. 'find': query/regex/path/limit. 'symbols': optional path/language/name/limit. 'deps': required path. 'impact': required path plus optional limit. Returns structured JSON."""

    def run(self, data) -> dict:
        raw = data["input"]
        try:
            params = json.loads(raw) if isinstance(raw, str) and raw.strip().startswith("{") else {"action": "find", "query": raw}
        except json.JSONDecodeError as e:
            return self.fail(f"Invalid JSON input: {e}")

        action = params.get("action", "find")
        if action == "find":
            payload = self._find(params)
        elif action == "symbols":
            payload = self._symbols(params)
        elif action == "deps":
            payload = self._deps(params)
        elif action == "impact":
            payload = self._impact(params)
        else:
            return self.fail("Unknown action. Use one of: find, symbols, deps, impact.")

        if isinstance(payload, dict) and payload.get("_error"):
            return self.fail(payload["_error"])
        return self.complete(json.dumps(payload, indent=2))

    def _iter_source_files(self, root: str):
        root = os.path.realpath(root or ".")
        for dirpath, dirnames, filenames in os.walk(root):
            rel_dir = os.path.relpath(dirpath, ".")
            dirnames[:] = [
                d
                for d in dirnames
                if d not in SKIP_DIRS and os.path.join(rel_dir, d) not in SKIP_DIRS and not d.startswith(".")
            ]
            for filename in filenames:
                ext = os.path.splitext(filename)[1].lower()
                if ext not in SOURCE_EXTENSIONS:
                    continue
                yield os.path.join(dirpath, filename)

    def _find(self, params: dict) -> dict:
        query = (params.get("query") or "").strip()
        if not query:
            return {"_error": "'query' is required for action='find'."}

        path = params.get("path", ".")
        limit = int(params.get("limit", 40))
        regex_mode = bool(params.get("regex", False))
        case_sensitive = bool(params.get("case_sensitive", False))

        args = ["rg", "-n", "--no-heading", "--color", "never"]
        if not case_sensitive:
            args.append("-i")
        if not regex_mode:
            args.append("-F")
        args.extend(
            [
                "--glob",
                "!.git/**",
                "--glob",
                "!node_modules/**",
                "--glob",
                "!data/conversations/**",
                query,
                path,
            ]
        )

        try:
            proc = subprocess.run(args, capture_output=True, text=True, timeout=10)
            output = proc.stdout.strip()
        except FileNotFoundError:
            return {"_error": "ripgrep (rg) is required for repo.find but was not found."}
        except Exception as e:
            return {"_error": f"Search failed: {e}"}

        results = []
        for line in output.splitlines():
            parts = line.split(":", 2)
            if len(parts) < 3:
                continue
            file_path, line_no, text = parts[0], parts[1], parts[2]
            results.append(
                {
                    "file": os.path.relpath(file_path, "."),
                    "line": int(line_no) if line_no.isdigit() else line_no,
                    "text": text.strip(),
                }
            )
            if len(results) >= limit:
                break

        return {
            "action": "find",
            "query": query,
            "regex": regex_mode,
            "path": path,
            "count": len(results),
            "results": results,
        }

    def _symbols(self, params: dict) -> dict:
        root = params.get("path", ".")
        name_filter = (params.get("name") or "").strip().lower()
        limit = int(params.get("limit", 200))

        patterns = [
            ("python_def", re.compile(r"^\s*def\s+([A-Za-z_]\w*)\s*\(")),
            ("python_class", re.compile(r"^\s*class\s+([A-Za-z_]\w*)\s*[\(:]")),
            ("js_function", re.compile(r"^\s*(?:export\s+)?function\s+([A-Za-z_]\w*)\s*\(")),
            ("js_class", re.compile(r"^\s*(?:export\s+)?class\s+([A-Za-z_]\w*)\s*[\{]")),
            ("js_const_fn", re.compile(r"^\s*(?:export\s+)?const\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\(")),
            ("go_func", re.compile(r"^\s*func(?:\s*\([^)]*\))?\s+([A-Za-z_]\w*)\s*\(")),
            ("go_type", re.compile(r"^\s*type\s+([A-Za-z_]\w*)\s+(?:struct|interface)")),
            ("rust_fn", re.compile(r"^\s*(?:pub\s+)?fn\s+([A-Za-z_]\w*)\s*\(")),
            ("rust_type", re.compile(r"^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)\b")),
        ]

        symbols = []
        for file_path in self._iter_source_files(root):
            try:
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    for idx, raw_line in enumerate(f, start=1):
                        line = raw_line.rstrip("\n")
                        for kind, pattern in patterns:
                            match = pattern.search(line)
                            if not match:
                                continue
                            name = match.group(1)
                            if name_filter and name_filter not in name.lower():
                                continue
                            symbols.append(
                                {
                                    "file": os.path.relpath(file_path, "."),
                                    "line": idx,
                                    "kind": kind,
                                    "name": name,
                                    "signature": line.strip(),
                                }
                            )
                            break
                        if len(symbols) >= limit:
                            break
                if len(symbols) >= limit:
                    break
            except Exception:
                continue

        return {
            "action": "symbols",
            "path": root,
            "count": len(symbols),
            "symbols": symbols,
        }

    def _deps(self, params: dict) -> dict:
        target = params.get("path")
        if not target:
            return {"_error": "'path' is required for action='deps'."}

        full_path = os.path.realpath(target)
        if not os.path.exists(full_path):
            return {"_error": f"File not found: {target}"}

        ext = os.path.splitext(full_path)[1].lower()
        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception as e:
            return {"_error": f"Failed to read file: {e}"}

        deps = set()
        if ext == ".py":
            for match in re.finditer(r"^\s*from\s+([A-Za-z0-9_\.]+)\s+import\b", content, re.MULTILINE):
                deps.add(match.group(1))
            for match in re.finditer(r"^\s*import\s+([A-Za-z0-9_\., ]+)", content, re.MULTILINE):
                parts = [p.strip().split(" as ")[0].strip() for p in match.group(1).split(",")]
                for part in parts:
                    if part:
                        deps.add(part)
        elif ext in {".js", ".jsx", ".ts", ".tsx"}:
            for match in re.finditer(r"from\s+['\"]([^'\"]+)['\"]", content):
                deps.add(match.group(1))
            for match in re.finditer(r"require\(\s*['\"]([^'\"]+)['\"]\s*\)", content):
                deps.add(match.group(1))
        elif ext == ".go":
            for match in re.finditer(r"^\s*import\s+\"([^\"]+)\"", content, re.MULTILINE):
                deps.add(match.group(1))
            for match in re.finditer(r"^\s*\"([^\"]+)\"\s*$", content, re.MULTILINE):
                deps.add(match.group(1))
        elif ext == ".rs":
            for match in re.finditer(r"^\s*use\s+([^;]+);", content, re.MULTILINE):
                deps.add(match.group(1).strip())

        dep_list = sorted(deps)
        return {
            "action": "deps",
            "path": os.path.relpath(full_path, "."),
            "count": len(dep_list),
            "dependencies": dep_list,
        }

    def _impact(self, params: dict) -> dict:
        target = params.get("path")
        if not target:
            return {"_error": "'path' is required for action='impact'."}

        full_path = os.path.realpath(target)
        if not os.path.exists(full_path):
            return {"_error": f"File not found: {target}"}

        limit = int(params.get("limit", 30))
        rel_target = os.path.relpath(full_path, ".")
        stem = os.path.splitext(os.path.basename(full_path))[0]

        impact = []
        for file_path in self._iter_source_files("."):
            rel = os.path.relpath(file_path, ".")
            if rel == rel_target:
                continue
            try:
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
            except Exception:
                continue

            reasons = []
            score = 0
            lower_rel = rel.lower()
            if "test" in lower_rel and stem.lower() in lower_rel:
                reasons.append("test file name matches target stem")
                score += 3
            if re.search(rf"\b{re.escape(stem)}\b", content):
                reasons.append("references target stem")
                score += 2
            if os.path.basename(rel_target) in content:
                reasons.append("mentions target filename")
                score += 1

            if score > 0:
                impact.append({"file": rel, "score": score, "reasons": reasons})

        impact.sort(key=lambda x: (-x["score"], x["file"]))
        impact = impact[:limit]

        suggested_tests = [entry["file"] for entry in impact if "test" in entry["file"].lower()][:10]
        return {
            "action": "impact",
            "path": rel_target,
            "count": len(impact),
            "related_files": impact,
            "suggested_tests": suggested_tests,
        }
