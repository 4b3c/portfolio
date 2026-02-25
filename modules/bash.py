import subprocess
from modules.module import Module

class BashModule(Module):
    """Runs a bash command in a subprocess and returns the output. Input: a shell command string."""

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
