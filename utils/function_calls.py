import json
import re

CLOSE_FUNCTION_CALL_TAG = "</function_calls>"
OPEN_FUNCTION_CALL_TAG = "<function_calls>"
TOOL_NAME_RE = re.compile(r"^[A-Za-z_]\w*$")
PARAM_NAME_RE = re.compile(r"^[A-Za-z_]\w*$")

FUNCTION_CALL_BLOCK_RE = re.compile(
    r"^\s*<function_calls>\s*<invoke\s+name\s*=\s*\"([^\"]+)\"\s*>(.*?)</invoke\s*>\s*</function_calls\s*>\s*$",
    re.DOTALL,
)


def _find_tag_tokens(text: str, tag_name: str):
    tag_re = re.compile(rf"<\s*(/?)\s*{re.escape(tag_name)}\b[^>]*>", re.IGNORECASE)
    for m in tag_re.finditer(text):
        yield {
            "is_close": bool(m.group(1)),
            "start": m.start(),
            "end": m.end(),
            "raw": m.group(0),
        }


def _find_callable_block_at_end(text: str):
    """
    Return (start, end, tool_name, invoke_body) for a valid top-level function call
    block that is the final non-whitespace content in text.
    Nested tags inside the block are allowed as content as long as the outer
    block is balanced and valid.
    """
    if not text:
        return None

    end_non_ws = len(text.rstrip())
    stack = []
    top_level_blocks = []

    for tok in _find_tag_tokens(text, "function_calls"):
        if not tok["is_close"]:
            stack.append(tok["start"])
            continue
        if not stack:
            return None
        start = stack.pop()
        if not stack:
            top_level_blocks.append((start, tok["end"]))

    if stack:
        return None

    for start, end in reversed(top_level_blocks):
        # Function call block must be the final non-whitespace content.
        if end != end_non_ws:
            continue
        block = text[start:end]
        match = FUNCTION_CALL_BLOCK_RE.match(block)
        if not match:
            continue
        tool_name = match.group(1).strip()
        if not TOOL_NAME_RE.match(tool_name):
            continue
        return (start, end, tool_name, match.group(2))

    return None


def _parse_top_level_parameters(invoke_body: str):
    """
    Parse top-level <parameter name="...">...</parameter> blocks.
    Nested <parameter> tags are treated as literal value content and must close
    before the top-level parameter closes.
    """
    s = invoke_body or ""
    i = 0
    params = {}
    nested_tag_re = re.compile(r"<\s*(/?)\s*parameter\b[^>]*>", re.IGNORECASE)

    while True:
        # Skip whitespace between parameter blocks.
        while i < len(s) and s[i].isspace():
            i += 1
        if i >= len(s):
            break

        open_match = re.match(r'<parameter\s+name\s*=\s*"([^"]+)"\s*>', s[i:])
        if not open_match:
            return None

        name = open_match.group(1).strip()
        if not PARAM_NAME_RE.match(name):
            return None
        value_start = i + open_match.end()
        i = value_start

        depth = 1
        cursor = i
        value_end = None
        while depth > 0:
            m = nested_tag_re.search(s, cursor)
            if not m:
                return None
            if m.group(1):
                depth -= 1
                if depth == 0:
                    value_end = m.start()
                    i = m.end()
                    break
            else:
                depth += 1
            cursor = m.end()

        if value_end is None:
            return None

        value = s[value_start:value_end]
        # Disallow duplicate top-level params.
        if name in params:
            return None
        params[name] = value

    return params


def contains_function_call_markup(text: str) -> bool:
    t = text or ""
    return OPEN_FUNCTION_CALL_TAG in t or CLOSE_FUNCTION_CALL_TAG in t


def first_completed_function_call_prefix(text: str) -> str | None:
    """Return text up to the first balanced <function_calls>...</function_calls> block."""
    t = text or ""
    stack = []
    for tok in _find_tag_tokens(t, "function_calls"):
        if not tok["is_close"]:
            stack.append(tok["start"])
            continue
        if not stack:
            return None
        stack.pop()
        if not stack:
            return t[: tok["end"]]
    return None


def extract_tool_call(text: str):
    """Extract an XML-style tool call from assistant text."""
    block = _find_callable_block_at_end(text or "")
    if not block:
        return None

    _, _, tool_name, invoke_body = block
    params = _parse_top_level_parameters(invoke_body)
    if params is None:
        return None
    if len(params) == 1 and "input" in params:
        input_val = params["input"]
    else:
        input_val = json.dumps(params)
    return {"tool": tool_name, "input": input_val}


def maybe_dispatch_tool_call(caller, text: str, include_called_tool: bool = False):
    """
    Parse text for a tool call and convert it to the standard tool result payload.
    Returns None if no tool call is present.
    """
    parsed = extract_tool_call(text)
    if not parsed:
        return None

    result = caller.call(parsed["tool"], parsed.get("input", ""))
    if include_called_tool:
        result["called_tool"] = parsed["tool"]
    return result


def truncate_after_function_call(text: str) -> str:
    """
    If a function call block is present, truncate any trailing text after
    the closing function_calls tag.
    """
    block = _find_callable_block_at_end(text or "")
    if not block:
        return text
    _, end, _, _ = block
    return text[:end]
