import json
import os
import sys
import uuid
from tools import TOOLS, TOOL_DESCRIPTIONS
from utils.conversation import ConversationStore
from utils.colors import print_error, print_tool, print_state, print_user
from utils.session import create_session, create_session_version_snapshot, current_session_id, trace_path

def save_trace(trace, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(trace, f, indent=2)


def _is_conversation_key(key: str) -> bool:
    return key == "conversation_id" or key.endswith("_conversation_id")


def _collect_conversation_ids(nodes: list[dict]) -> dict:
    """Collect nearest conversation-id keys from a root->leaf node path."""
    merged = {}
    for node in nodes:
        for key, value in node.items():
            if _is_conversation_key(key) and isinstance(value, str):
                merged[key] = value
    return merged


def find_active_path(node):
    """Recursively find the path of incomplete (no output) nodes from root to deepest active call."""
    if "output" in node:
        return None
    path = [node]
    for child in reversed(node.get("called", [])):
        child_path = find_active_path(child)
        if child_path:
            path.extend(child_path)
            break
    return path


def _start_assistant_root(session_id: str, trace_file: str, user_input: str, conversation_id: str | None = None):
    trace = []
    root_node = {
        "id": str(uuid.uuid4())[:12],
        "tool": "assistant",
        "input": None,
        "called": [],
        "session_id": session_id,
    }
    if conversation_id:
        root_node["conversation_id"] = conversation_id
    trace.append(root_node)
    save_trace(trace, trace_file)

    tool = TOOLS["assistant"](TOOL_DESCRIPTIONS)
    payload = {"tool": "assistant", "input": user_input}
    if conversation_id:
        payload["conversation_id"] = conversation_id
    result = tool.run(payload)
    stack = [(tool, root_node)]
    main_loop(trace, stack, root_node, result, trace_file)


def main_loop(trace, stack, current_node, result, trace_file):
    while True:
        try:
            if "tool" in result:
                resume_existing = bool(result.get("_resume"))
                node_input = result.get("input")
                if resume_existing and result.get("resume_input"):
                    node_input = result.get("resume_input")
                child_node = {
                    "id": str(uuid.uuid4())[:12],
                    "tool": result["tool"],
                    "input": node_input,
                    "called": [],
                }
                # Preserve conversation identifiers for nested tool sessions.
                for key, value in result.items():
                    if _is_conversation_key(key) and isinstance(value, str):
                        child_node[key] = value

                current_node["called"].append(child_node)
                current_node = child_node

                save_trace(trace, trace_file)

                tool_name = result["tool"]
                if tool_name not in TOOLS:
                    error = f"Tool '{tool_name}' not found."
                    print_error("Error:", error)
                    result = {"tool": "failure", "input": error, "manual": False}
                    continue

                new_tool = TOOLS[tool_name](TOOL_DESCRIPTIONS)
                if resume_existing:
                    print_tool("Resuming tool:", tool_name, result.get("resume_input", "") or "")
                    result = new_tool.resume(result)
                else:
                    print_tool("Running tool:", tool_name, result.get("input", "") or "")
                    result = new_tool.run(result)
                tool = new_tool
                stack.append((tool, current_node))

            elif "output" in result:
                current_node["output"] = result["output"]
                save_trace(trace, trace_file)

                stack.pop()

                if not stack:
                    break

                caller_tool, current_node = stack[-1]
                output_preview = (result.get("output", "") or "").strip().split('\n')[0]
                print_tool("Resuming tool:", current_node["tool"], output_preview)
                result = caller_tool.resume(result)
            else:
                error = f"Invalid result payload: expected 'tool' or 'output', got keys {list(result.keys())}"
                print_error("Error:", error)
                result = {"tool": "failure", "input": error, "manual": False}

        except Exception as e:
            error = f"Main loop exception: {e}"
            print_error("Error:", error)
            # Avoid recursive failure loop if failure itself crashes.
            if result.get("tool") == "failure" or current_node.get("tool") == "failure":
                current_node["output"] = f"Error: {error}"
                save_trace(trace, trace_file)
                break
            result = {"tool": "failure", "input": error, "manual": False}


def run():
    session_id = create_session()
    trace_file = trace_path(session_id)
    print_state(f"[Session] Started {session_id}")
    try:
        snapshot_path = create_session_version_snapshot("start", session_id)
        print_state(f"[Session] Snapshot created: {snapshot_path}")
    except Exception as e:
        print_error("Snapshot error:", str(e))
    user_input = input(print_user())
    _start_assistant_root(session_id, trace_file, user_input)


def restart_run():
    print_state("[Zipper restarting — loading trace...]\n")
    session_id = current_session_id(create_if_missing=False)
    if not session_id:
        print_error("No active session found. Starting fresh.")
        run()
        return
    print_state(f"[Session] Resuming {session_id}")
    try:
        snapshot_path = create_session_version_snapshot("restart", session_id)
        print_state(f"[Session] Snapshot created: {snapshot_path}")
    except Exception as e:
        print_error("Snapshot error:", str(e))
    trace_file = trace_path(session_id)
    if not os.path.exists(trace_file):
        print_error("No active session trace found. Starting fresh.")
        run()
        return

    with open(trace_file) as f:
        trace = json.load(f)

    active_path = find_active_path(trace[0])

    if not active_path or len(active_path) < 2:
        print_state("No active session found in trace. Loading latest conversation in current session.")
        store = ConversationStore("assistant")
        ids = store.list_ids()
        last_conv = ids[-1] if ids else None
        if last_conv:
            print_state(f"[Session] Loaded conversation {last_conv}")
        user_input = input(print_user())
        _start_assistant_root(session_id, trace_file, user_input, conversation_id=last_conv)
        return

    # The deepest node is the restart call — mark it complete
    restart_node = active_path[-1]
    restart_node["output"] = "Process restarted successfully."
    save_trace(trace, trace_file)

    # Rebuild the stack for all ancestor nodes (everything above restart)
    stack = []
    for node in active_path[:-1]:
        m = TOOLS[node["tool"]](TOOL_DESCRIPTIONS)
        stack.append((m, node))

    # Resume the parent tool with the restart output
    current_node = active_path[-2]
    result = {
        "output": "Process restarted successfully.",
        "called_tool": "restart",
    }
    result.update(_collect_conversation_ids(active_path))

    print_tool("Resuming tool:", current_node['tool'])
    result = stack[-1][0].resume(result)

    main_loop(trace, stack, current_node, result, trace_file)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "restart":
        restart_run()
    else:
        run()
