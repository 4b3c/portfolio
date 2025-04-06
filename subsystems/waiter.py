from .subsystem import Subsystem
from .router import Message

class Waiter(Subsystem):
    def __init__(self):
        super().__init__("Waiter")
        self.channel_command_output = self.create_channel("command-output")
        self.channel_done_waiting = self.create_channel("done-waiting")
        self.received: dict[str, Message] = {"command-input": None, "command-output": None}

    async def collect_and_send(self):
        if self.received["command-input"] == None: return
        if self.received["command-output"] == None: return
        
        await self.channel_command_output.send(self.received["command-output"])
        await self.channel_done_waiting.send(Message("Waiter", "")) # Prompts ollama to respond
        self.received["command-input"] = None
        self.received["command-output"] = None

    # Console and Ollama will route to this with the original text
    async def receive_input(self, data):
        self.received["command-input"] = data
        await self.collect_and_send()

    # Console actions and Ollama actions will route to this with the command's output
    async def receive_output(self, data):
        self.received["command-output"] = data
        await self.collect_and_send()
