"""Terminal print utilities with ANSI color and markdown formatting."""

import re
import sys

# ANSI codes
_R    = '\033[0m'    # full reset
_B    = '\033[1m'    # bold on
_BOff = '\033[22m'   # bold off (keeps color)
_I    = '\033[3m'    # italic on
_IOff = '\033[23m'   # italic off (keeps color)
_DIM  = '\033[2m'    # dim

_GREEN   = '\033[92m'
_YELLOW  = '\033[93m'
_RED     = '\033[91m'
_BLUE    = '\033[94m'
_CYAN    = '\033[96m'
_MAGENTA = '\033[95m'
_WHITE   = '\033[97m'


def _fmt(text: str) -> str:
    """Apply markdown formatting using targeted resets so base color is preserved."""
    lines = []
    for line in text.split('\n'):
        stripped = line.strip()
        # Bullet points
        if stripped.startswith('- ') or stripped.startswith('* '):
            indent = len(line) - len(line.lstrip())
            line = ' ' * indent + '• ' + stripped[2:]
        # Headers (bold only, no color reset)
        if stripped.startswith('### '):
            line = f"{_B}{stripped[4:]}{_BOff}"
        elif stripped.startswith('## '):
            line = f"{_B}{stripped[3:]}{_BOff}"
        elif stripped.startswith('# '):
            line = f"{_B}{stripped[2:]}{_BOff}"
        # Bold **text** — targeted reset keeps base color
        line = re.sub(r'\*\*(.+?)\*\*', f'{_B}\\1{_BOff}', line)
        # Italic *text*
        line = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', f'{_I}\\1{_IOff}', line)
        lines.append(line)
    return '\n'.join(lines)


def _truncate(text: str, max_lines: int = 3) -> str:
    lines = text.splitlines()
    if len(lines) <= max_lines:
        return text
    return '\n'.join(lines[:max_lines]) + '\n...'


# ── Streaming ─────────────────────────────────────────────────────────────────

class LineStream:
    """Buffer streaming tokens line by line, formatting each complete line.

    If fn_color is set, lines inside <function_calls>...</function_calls> blocks
    are printed in that color with indentation instead of the base color.
    """

    def __init__(self, base_color: str = _WHITE, fn_color: str = None):
        self._buf = ""
        self._base = base_color
        self._fn_color = fn_color
        self._in_fn = False

    def _print_line(self, line: str):
        if self._fn_color:
            stripped = line.strip()
            if stripped == '<function_calls>':
                self._in_fn = True
                sys.stdout.write(f"\n{self._fn_color}{_DIM}  {stripped}{_R}\n")
                sys.stdout.flush()
                return
            if stripped == '</function_calls>':
                self._in_fn = False
                sys.stdout.write(f"{self._fn_color}{_DIM}  {stripped}{_R}\n\n")
                sys.stdout.flush()
                return
            if self._in_fn:
                sys.stdout.write(f"{self._fn_color}  {stripped}{_R}\n")
                sys.stdout.flush()
                return
        sys.stdout.write(self._base + _fmt(line) + '\n')
        sys.stdout.flush()

    def token(self, text: str):
        self._buf += text
        while '\n' in self._buf:
            line, self._buf = self._buf.split('\n', 1)
            self._print_line(line)

    def flush(self):
        if self._buf:
            if self._in_fn:
                sys.stdout.write(f"{self._fn_color}  {self._buf.strip()}{_R}")
            else:
                sys.stdout.write(self._base + _fmt(self._buf))
            sys.stdout.flush()
            self._buf = ""


def stream_label(label: str, color: str):
    """Print a colored bold label then stay on the same line for streaming."""
    sys.stdout.write(f"{color}{_B}{label}{_R} ")
    sys.stdout.flush()


def stream_end():
    """Reset color and print trailing newline after a stream."""
    sys.stdout.write(_R + '\n\n')
    sys.stdout.flush()


# ── Print functions ───────────────────────────────────────────────────────────

def print_user() -> str:
    """Return a colored 'User: ' prompt string for use with input()."""
    return f"{_GREEN}{_B}User:{_R} "


def print_error(label: str, text: str = ""):
    """Red bold label, optional red text."""
    if text:
        print(f"{_RED}{_B}{label}{_R} {_RED}{text}{_R}")
    else:
        print(f"{_RED}{_B}{label}{_R}")


def print_module(action: str, name: str, detail: str = ""):
    """Blue action label + bold module name + optional dim detail."""
    detail_str = f"{_R}{_DIM} {detail[:120]}{_R}" if detail else ""
    print(f"{_BLUE}{action} {_B}{name}{detail_str}{_R}")


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
