import os
import sys
import time
from modules.module import Module
from utils.colors import print_state


class RestartModule(Module):
    """Restart the Zipper process so that code changes take effect. Use this after editing any source file — the process will reload with the updated code and resume from the current trace. No input required."""

    def run(self, data) -> dict:
        script = os.path.abspath("zipper.py")
        python = sys.executable

        print_state("\n[Restarting in 5 seconds with updated code...]\n")
        time.sleep(5)

        # Replace current process with the new one, reusing the same terminal
        os.execv(python, [python, script, "restart"])
