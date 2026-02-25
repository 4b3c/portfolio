import os
import re
from utils.claude import call_claude
from utils.colors import LineStream, stream_end, stream_label, _WHITE
from utils.session import conversations_dir


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
    raw = call_claude(
        messages,
        model=model,
        temperature=temperature,
        timeout=timeout,
        max_tokens=max_tokens,
        on_token=ls.token,
    ).strip()
    ls.flush()
    stream_end()
    return raw
