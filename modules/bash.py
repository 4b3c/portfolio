import subprocess
from modules.module import Module

class BashModule(Module):
    """Run a shell command and return its output. Input: a shell command string. Use this for running scripts, checking system state, installing packages, or any operation that requires a terminal. Do NOT use this to edit files — use the code module for targeted edits or the file module for full rewrites."""

    def run(self, data) -> dict:
        command = data["input"]

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
