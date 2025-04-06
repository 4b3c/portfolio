from enum import Enum
from aioconsole import ainput
import asyncio
from .subsystem import Subsystem
from .router import Message

RED = "\033[91m"
GREEN = "\033[92m"
BLUE = "\033[94m"
YELLOW = "\033[93m"
PURPLE = "\033[95m"
RESET = "\033[0m"


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
        self.channel_user_input = self.create_channel("user-input")

    def set_state(self, new_state):
        # print(f"[Console State]: {self.state} -> {new_state}")
        self.state = new_state

    def display(self, message: Message, end=""):
        match message.role:
            case "Abram":
                print(f"{PURPLE}Abram: {RESET}", end=end, flush=True) # No message, awaiting input
            case "Zipper":
                print(f"{GREEN}Zipper: {RESET}", end=end, flush=True) # No message, awaiting stream
            case "System":
                print(f"{BLUE}System: {YELLOW}{message.text}{RESET}", end=end, flush=True) # Print the system output in yellow
            case "Ignore":
                print(message.text, end=end, flush=True)
            case _:
                print(f"{message.role}: {message.text}", end=end, flush=True)

    async def wait_until(self, state_val):
        while self.state != state_val:
            await asyncio.sleep(0.2)

    async def received_input(self, input_text: str):
        if self.ainput_task: self.ainput_task.cancel()
        await self.channel_user_input.send(Message("Abram", input_text))
        self.set_state(ConsoleState.MY_COMMANDS_RUNNING)

    async def terminal_input(self):
        self.display(Message("Abram", ""))
        input_text = await ainput()
        await self.received_input(input_text)

    # Ollama-stream will route to this
    async def stream(self, message: Message):
        await self.wait_until(ConsoleState.STREAMING)
        print(message.text, end="", flush=True)

    # Ollama-state will route to this
    async def ollama_state(self, message: Message):
        if "[Starting]" in message.text:
            self.set_state(ConsoleState.STREAMING)
            self.display(Message("Zipper", ""), "")
        elif "[Complete]" in message.text:
            self.set_state(ConsoleState.OLLAMA_COMMANDS_RUNNING)
            self.display(Message("Ignore", ""), "\n")
        
    # Discord will route to this
    async def discord_interrupt(self, message: Message):
        await self.wait_until(ConsoleState.INPUT)
        await self.received_input(message.text)
        self.display(Message("Ignore", message.text), "\n")

    # Ollama's Actions will route to this
    async def ollama_actions_output(self, message: Message):
        await self.wait_until(ConsoleState.OLLAMA_COMMANDS_RUNNING)
        if message.text: self.display(message)
        self.ainput_task = asyncio.create_task(self.terminal_input())
        self.set_state(ConsoleState.INPUT)

    # My Actions will route to this
    async def my_actions_output(self, message: Message):
        await self.wait_until(ConsoleState.MY_COMMANDS_RUNNING)
        if message.text: self.display(message)
        self.set_state(ConsoleState.STREAMING)
