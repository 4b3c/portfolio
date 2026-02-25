import json
import re

FUNCTION_CALL_RE = re.compile(
    r"<function_calls>\s*<invoke name=\"(\w+)\">(.*?)</invoke>\s*</function_calls>",
    re.DOTALL,
)
PARAM_RE = re.compile(r'<parameter name="(\w+)">(.*?)</parameter>', re.DOTALL)


def extract_module_call(text: str):
    """Extract an XML-style module call from assistant text."""
    match = FUNCTION_CALL_RE.search(text or "")
    if not match:
        return None

    module_name = match.group(1)
    params = {m.group(1): m.group(2) for m in PARAM_RE.finditer(match.group(2))}
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
