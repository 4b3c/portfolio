import subprocess
from modules.module import Module

class BashModule(Module):
    """Run a shell command and return its output.

    Input contract: `data["input"]` is a plain text string (shell command).
    Use this for running scripts, checking system state, and terminal operations.
    Do NOT use this to edit files; use `code` or `file` instead.
    """

    def run(self, data) -> dict:
        command = self.input_text(data)

        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )
            output = result.stdout if result.stdout else result.stderr
            return self.complete(output.strip())
        except subprocess.TimeoutExpired:
            return self.fail("Command timed out after 30 seconds.")
        except Exception as e:
            return self.fail(str(e))
