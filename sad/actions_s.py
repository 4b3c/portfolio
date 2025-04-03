import re
import subprocess
import sys
from subsystem import Subsystem


RED = "\033[91m"
GREEN = "\033[92m"
BLUE = "\033[94m"
YELLOW = "\033[93m"
PURPLE = "\033[95m"
RESET = "\033[0m"

def detect_and_execute(text, name):
    matches = re.findall(r"<<<(.*?)>>>", text, re.DOTALL)
    if matches == None:
        return None
    
    output = ""
    for command_block in matches:
        command_to_run = command_block.strip()

        if not command_to_run:
            return None
        
        if "python restart.py" in command_to_run:
            print(f"{BLUE}System:{RESET} Restarting Zipper...")
            subprocess.Popen(["python", "restart.py"])
            sys.exit()

        try:
            result = subprocess.run(command_to_run, shell=True, capture_output=True, text=True, timeout=5)
            output_text = result.stdout.strip().replace("\n", "\n\t> ")
            error_text = result.stderr.strip().replace("\n", "\n\t> ")
        except Exception as e:
            output_text = ""
            error_text = f"Error during execution: {e}"

        if error_text:
            output += f"\n\t{name} ran:\n\t> {command_to_run}\n\tError:\n\t> {error_text}\n"
        else:
            output += f"\n\t{name} ran:\n\t> {command_to_run}\n\tOutput:\n\t> {output_text}\n"



    return output

# Publishes: Output from running commands/actions

class Actions(Subsystem):

    def __init__(self) -> None:
        super().__init__("actions")

    async def main_loop(self):
        while True:
            msg = await self.listen()
            output = detect_and_execute(msg.message)
            self.publish((msg.message + output) if output is not None else msg.message)
            
