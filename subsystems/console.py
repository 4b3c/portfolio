from enum import Enum
from aioconsole import ainput
import asyncio
from .subsystem import Subsystem

RED = "\033[91m"
GREEN = "\033[92m"
BLUE = "\033[94m"
YELLOW = "\033[93m"
PURPLE = "\033[95m"
RESET = "\033[0m"

ABRAM = f"{PURPLE}Abram:{RESET} "
ZIPPER = f"{GREEN}Zipper:{RESET} "


class ConsoleState(Enum):
    STREAMING = "streaming"
    INPUT = "input"
    OLLAMA_COMMANDS_RUNNING = "ollama-commands-running"
    MY_COMMANDS_RUNNING = "my-commands-running"


class Console(Subsystem):
    def __init__(self):
        super().__init__("Console")
        self.state = ConsoleState.STREAMING
        self.ainput_task = None
        self.channel_user_input = self.create_channel("user_input")

    def set_state(self, new_state):
        # print(f"[Console State]: {self.state} -> {new_state}")
        self.state = new_state

    async def wait_until(self, state_val):
        while self.state != state_val:
            await asyncio.sleep(0.2)

    async def received_input(self, data):
        if self.ainput_task: self.ainput_task.cancel()
        await self.channel_user_input.send("Abram: " + data)
        self.set_state(ConsoleState.MY_COMMANDS_RUNNING)

    async def terminal_input(self):
        data = await ainput(ABRAM)
        await self.received_input(data)

    # Ollama-stream will route to this
    async def stream(self, data):
        await self.wait_until(ConsoleState.STREAMING)
        print(data, end="", flush=True)

    # Ollama-state will route to this
    async def ollama_state(self, data):
        if "[Starting]" in data:
            self.set_state(ConsoleState.STREAMING)
            print(ZIPPER, end="")
        elif "[Complete]" in data:
            self.set_state(ConsoleState.OLLAMA_COMMANDS_RUNNING)
        
    # Discord will route to this
    async def discord_interrupt(self, data):
        await self.wait_until(ConsoleState.INPUT)
        await self.received_input(data)
        print(data)

    # Ollama's Actions will route to this
    async def ollama_actions_output(self, data):
        await self.wait_until(ConsoleState.OLLAMA_COMMANDS_RUNNING)
        print((data) if data else "")
        self.ainput_task = asyncio.create_task(self.terminal_input())
        self.set_state(ConsoleState.INPUT)

    # My Actions will route to this
    async def my_actions_output(self, data):
        await self.wait_until(ConsoleState.MY_COMMANDS_RUNNING)
        print((data) if data else "")
        self.set_state(ConsoleState.STREAMING)
