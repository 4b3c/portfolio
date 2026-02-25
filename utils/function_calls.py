import json
import re

CLOSE_FUNCTION_CALL_TAG = "</function_calls>"
OPEN_FUNCTION_CALL_TAG = "<function_calls>"
MODULE_NAME_RE = re.compile(r"^[A-Za-z_]\w*$")
PARAM_NAME_RE = re.compile(r"^[A-Za-z_]\w*$")

FUNCTION_CALL_BLOCK_RE = re.compile(
    r"^\s*<function_calls>\s*<invoke\s+name\s*=\s*\"([^\"]+)\"\s*>(.*?)</invoke\s*>\s*</function_calls\s*>\s*$",
    re.DOTALL,
)


def _find_callable_block_at_end(text: str):
    """
    Return (start, end, module_name, invoke_body) for a valid top-level function call
    block that is the final non-whitespace content in text.
    Nested <function_calls> blocks are rejected.
    """
    if not text:
        return None

    # Require exactly one top-level function_calls block in the whole response.
    if text.count(OPEN_FUNCTION_CALL_TAG) != 1 or text.count(CLOSE_FUNCTION_CALL_TAG) != 1:
        return None

    starts = [m.start() for m in re.finditer(re.escape(OPEN_FUNCTION_CALL_TAG), text)]
    for start in reversed(starts):
        close_idx = text.find(CLOSE_FUNCTION_CALL_TAG, start)
        if close_idx == -1:
            continue
        end = close_idx + len(CLOSE_FUNCTION_CALL_TAG)

        # Function call block must be the final non-whitespace content.
        if text[end:].strip():
            continue

        block = text[start:end]

        # Reject nested function_calls inside candidate block.
        inner = block[len(OPEN_FUNCTION_CALL_TAG) : -len(CLOSE_FUNCTION_CALL_TAG)]
        if OPEN_FUNCTION_CALL_TAG in inner:
            continue

        match = FUNCTION_CALL_BLOCK_RE.match(block)
        if not match:
            continue
        module_name = match.group(1).strip()
        if not MODULE_NAME_RE.match(module_name):
            continue
        return (start, end, module_name, match.group(2))

    return None


def _parse_top_level_parameters(invoke_body: str):
    """
    Parse only top-level <parameter name="...">...</parameter> blocks.
    Reject nested/ambiguous parameter tags to avoid accidental parsing when
    examples are embedded in parameter text.
    """
    s = invoke_body or ""
    i = 0
    params = {}

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
        i += open_match.end()

        close_rel = s.find("</parameter>", i)
        if close_rel == -1:
            return None

        value = s[i:close_rel]

        # Disallow nested parameter tags in values. This prevents accidental
        # argument overrides when prompt examples include parameter XML.
        if "<parameter" in value or "</parameter>" in value:
            return None

        # Disallow duplicate top-level params.
        if name in params:
            return None
        params[name] = value

        i = close_rel + len("</parameter>")

    return params


def contains_function_call_markup(text: str) -> bool:
    t = text or ""
    return OPEN_FUNCTION_CALL_TAG in t or CLOSE_FUNCTION_CALL_TAG in t


def extract_module_call(text: str):
    """Extract an XML-style module call from assistant text."""
    block = _find_callable_block_at_end(text or "")
    if not block:
        return None

    _, _, module_name, invoke_body = block
    params = _parse_top_level_parameters(invoke_body)
    if params is None:
        return None
    if len(params) == 1 and "input" in params:
        input_val = params["input"]
    else:
        input_val = json.dumps(params)
    return {"module": module_name, "input": input_val}


def maybe_dispatch_module_call(caller, text: str, include_called_module: bool = False):
    """
    Parse text for a module call and convert it to the standard module result payload.
    Returns None if no module call is present.
    """
    parsed = extract_module_call(text)
    if not parsed:
        return None

    result = caller.call(parsed["module"], parsed.get("input", ""))
    if include_called_module:
        result["called_module"] = parsed["module"]
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
