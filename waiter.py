from subsystem import Subsystem


class Waiter(Subsystem):
    def __init__(self):
        super().__init__("Waiter")
        self.channel_command_output = self.create_channel("commands")
        self.channel_combined = self.create_channel("combined")
        self.received = {"command-input": None, "command-output": None}

    async def collect_and_send(self):
        if self.received["command-input"] == None: return
        if self.received["command-output"] == None: return
        
        await self.channel_command_output.send(self.received["command-output"])
        await self.channel_combined.send(self.received["command-input"] + self.received["command-output"])
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
