import re
import subprocess
from subsystem import Subsystem

RED = "\033[91m"
GREEN = "\033[92m"
BLUE = "\033[94m"
YELLOW = "\033[93m"
PURPLE = "\033[95m"
RESET = "\033[0m"

class Actions(Subsystem):
    def __init__(self):
        super().__init__("Actions")
        self.channel_command_output = self.create_channel("command-output")

    # Console and Ollama will route to this, which will detect and run commands
    async def command_input(self, data):
        matches = re.findall(r"<<<(.*?)>>>", data, re.DOTALL)
        if not matches:
            await self.channel_command_output.send("")
            return
        
        output = ""
        for command_block in matches:
            command_to_run = command_block.strip()

            if not command_to_run: continue

            try:
                result = subprocess.run(command_to_run, shell=True, capture_output=True, text=True, timeout=5)
                output_text = result.stdout.strip().replace("\n", "\n\t> ")
                error_text = result.stderr.strip().replace("\n", "\n\t> ")
            except Exception as e:
                output_text = ""
                error_text = f"Error during execution: {e}"

            if error_text: output += f"{RED}\n    Ran:\n\t> {command_to_run}\n     Error:\n\t> {error_text}\n{RESET}"
            else: output += f"{YELLOW}\n    Ran:\n\t> {command_to_run}\n    Output:\n\t> {output_text}\n{RESET}"

        await self.channel_command_output.send(output)