import json
import os
import re
import zipfile
from time import time

DATA_ROOT = "data"
SESSIONS_ROOT = os.path.join(DATA_ROOT, "sessions")
CURRENT_SESSION_PATH = os.path.join(DATA_ROOT, "current_session.json")

NUMERIC_LABEL_RE = re.compile(r"^\d+(?:\.\d+)?$")


def _new_session_id() -> str:
    return str(int(time()))


def _ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def _write_current_session(session_id: str):
    _ensure_dir(DATA_ROOT)
    with open(CURRENT_SESSION_PATH, "w") as f:
        json.dump({"session_id": session_id}, f, indent=2)


def _read_current_session() -> str | None:
    if not os.path.exists(CURRENT_SESSION_PATH):
        return None
    try:
        with open(CURRENT_SESSION_PATH) as f:
            payload = json.load(f)
        return payload.get("session_id")
    except Exception:
        return None


def create_session(session_id: str | None = None) -> str:
    sid = session_id or _new_session_id()
    _ensure_dir(session_dir(sid))
    _ensure_dir(conversations_dir(sid))
    _ensure_dir(state_dir(sid))
    _write_current_session(sid)
    return sid


def current_session_id(create_if_missing: bool = False) -> str | None:
    sid = _read_current_session()
    if sid and os.path.exists(session_dir(sid)):
        return sid
    if create_if_missing:
        return create_session()
    return None


def session_dir(session_id: str | None = None) -> str:
    sid = session_id or current_session_id(create_if_missing=True)
    return os.path.join(SESSIONS_ROOT, sid)


def conversations_dir(session_id: str | None = None) -> str:
    return os.path.join(session_dir(session_id), "conversations")


def state_dir(session_id: str | None = None) -> str:
    return os.path.join(session_dir(session_id), "state")


def versions_dir(session_id: str | None = None) -> str:
    return os.path.join(session_dir(session_id), "versions")


def trace_path(session_id: str | None = None) -> str:
    return os.path.join(session_dir(session_id), "trace.json")


def state_path(filename: str, session_id: str | None = None) -> str:
    return os.path.join(state_dir(session_id), filename)


def list_numeric_conversation_labels(session_id: str | None = None) -> list[str]:
    path = conversations_dir(session_id)
    if not os.path.exists(path):
        return []
    labels = []
    for name in os.listdir(path):
        if not name.endswith(".json"):
            continue
        label = name[:-5]
        if NUMERIC_LABEL_RE.match(label):
            labels.append(label)
    return sorted(labels, key=_label_sort_key)


def _label_sort_key(label: str):
    parts = label.split(".")
    root = int(parts[0])
    if len(parts) == 1:
        return (root, 0)
    return (root, int(parts[1]))


def create_session_version_snapshot(reason: str = "start", session_id: str | None = None) -> str:
    sid = session_id or current_session_id(create_if_missing=True)
    vdir = versions_dir(sid)
    _ensure_dir(vdir)
    stamp = str(int(time()))
    safe_reason = re.sub(r"[^a-z0-9_-]+", "-", reason.lower()).strip("-") or "snapshot"
    zip_path = os.path.join(vdir, f"{stamp}_{safe_reason}.zip")

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, filenames in os.walk("."):
            rel_root = os.path.relpath(root, ".")

            # Exclude heavy/runtime/meta trees.
            dirs[:] = [
                d
                for d in dirs
                if not d.startswith(".")
                and d not in {"__pycache__", "node_modules", ".venv"}
                and os.path.join(rel_root, d) != "data/sessions"
            ]

            for filename in filenames:
                filepath = os.path.join(root, filename)
                rel_path = os.path.relpath(filepath, ".")
                if rel_path.startswith("data/sessions/"):
                    continue
                zf.write(filepath, arcname=rel_path)
    return zip_path
