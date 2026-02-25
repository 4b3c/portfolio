"""Terminal print utilities with ANSI color and markdown formatting."""

import re

# ANSI codes
_R  = '\033[0m'   # reset
_B  = '\033[1m'   # bold
_I  = '\033[3m'   # italic
_DIM = '\033[2m'  # dim

_GREEN   = '\033[92m'
_YELLOW  = '\033[93m'
_RED     = '\033[91m'
_BLUE    = '\033[94m'
_CYAN    = '\033[96m'
_MAGENTA = '\033[95m'
_WHITE   = '\033[97m'


def _fmt(text: str) -> str:
    """Apply basic markdown formatting: **bold**, *italic*, bullet points, # headers."""
    lines = []
    for line in text.split('\n'):
        stripped = line.strip()
        # Bullet points
        if stripped.startswith('- ') or stripped.startswith('* '):
            indent = len(line) - len(line.lstrip())
            line = ' ' * indent + '• ' + stripped[2:]
        # Headers
        if stripped.startswith('### '):
            line = f"{_B}{stripped[4:]}{_R}"
        elif stripped.startswith('## '):
            line = f"{_B}{stripped[3:]}{_R}"
        elif stripped.startswith('# '):
            line = f"{_B}{stripped[2:]}{_R}"
        # Bold **text**
        line = re.sub(r'\*\*(.+?)\*\*', f'{_B}\\1{_R}', line)
        # Italic *text* (not preceded/followed by *)
        line = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', f'{_I}\\1{_R}', line)
        lines.append(line)
    return '\n'.join(lines)


def _truncate(text: str, max_lines: int = 3) -> str:
    lines = text.splitlines()
    if len(lines) <= max_lines:
        return text
    return '\n'.join(lines[:max_lines]) + '\n...'


# ── Public print functions ────────────────────────────────────────────────────

def print_assistant(text: str):
    """Yellow bold 'Assistant:' label, then white markdown-formatted text."""
    print(f"{_YELLOW}{_B}Assistant:{_R} {_WHITE}{_fmt(text)}{_R}\n")


def print_user() -> str:
    """Return a colored 'User: ' prompt string for use with input()."""
    return f"{_GREEN}{_B}User:{_R} "


def print_error(label: str, text: str = ""):
    """Red bold label, optional red text."""
    if text:
        print(f"{_RED}{_B}{label}{_R} {_RED}{text}{_R}")
    else:
        print(f"{_RED}{_B}{label}{_R}")


def print_module(action: str, name: str):
    """Blue action label + bold module name."""
    print(f"{_BLUE}{action} {_B}{name}{_R}")


def print_module_output(module_name: str, output: str):
    """Cyan bold module name, output truncated to 3 lines."""
    truncated = _truncate(output.strip())
    print(f"{_CYAN}{_B}{module_name}:{_R} {_CYAN}{truncated}{_R}\n")


def print_state(text: str):
    """Magenta status/persistence message."""
    print(f"{_MAGENTA}{text}{_R}")


def print_info(text: str):
    """Dim white informational text."""
    print(f"{_DIM}{_WHITE}{text}{_R}")


def print_failure(text: str):
    """Red bold 'Failure:' label, then white markdown-formatted diagnostic text."""
    print(f"{_RED}{_B}Failure:{_R} {_WHITE}{_fmt(text)}{_R}\n")


def print_reasoning(text: str):
    """Magenta bold 'Reasoning:' label, then white markdown-formatted text."""
    print(f"{_MAGENTA}{_B}Reasoning:{_R} {_WHITE}{_fmt(text)}{_R}\n")
