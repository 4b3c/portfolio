import os
import sys
import time
from modules.module import Module
from utils.colors import print_state


class RestartModule(Module):
    """Restart the Zipper process so code changes take effect.

    Input contract: ignores `data["input"]` (no input required).
    Use after editing source so runtime reloads and resumes from current trace.
    """

    def run(self, data) -> dict:
        script = os.path.abspath("zipper.py")
        python = sys.executable

        print_state("\n[Restarting in 5 seconds with updated code...]\n")
        time.sleep(5)

        # Replace current process with the new one, reusing the same terminal
        os.execv(python, [python, script, "restart"])
