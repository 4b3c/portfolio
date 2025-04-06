from collections.abc import Generator
import platform
import time
import requests
import json
import asyncio
from .subsystem import Subsystem
from .router import Message

MODEL_NAME = "llama3.2"
OLLAMA_API_URL = "http://localhost:11434/api/generate"

def get_intructions():
    with open("prompts/instructions.txt", "r") as f:
        instructions = f.read()
    f.close()
    return instructions.replace("{{OS}}", platform.platform())

def get_memory():
    with open("prompts/memory.txt", "r") as f:
        memory = f.read()
    f.close()
    return memory

def stream_ollama(prompt: str) -> Generator[str, None, None]:
    payload = {
        'model': MODEL_NAME,
        'prompt': prompt,
        'stream': True,
        'options': {'temperature': 0.2, 'stop': ['System:', 'Abram:']}
    }
    try:
        response = requests.post(OLLAMA_API_URL, json=payload, stream=True)
        response.raise_for_status()
        for line in response.iter_lines():
            if line:
                data = json.loads(line.decode('utf-8'))
                yield data.get("response", "")

    # TODO: Fix this error handling
    except requests.RequestException as e:
        yield f"[OLLAMA ERROR] {e}"

class Ollama(Subsystem):
    def __init__(self):
        super().__init__("Ollama")
        self.conversation = get_intructions() + get_memory() + "\nSystem: You are now online. Say hi to Abram.\n"
        self.channel_ollama_stream = self.create_channel("ollama-stream")
        self.channel_ollama_state = self.create_channel("ollama-state")
        self.channel_ollama_output = self.create_channel("ollama-output")
        self.conversation_file = f"conversations/{time.time()}.txt"

    def save_conversation(self):
        with open(self.conversation_file, "w") as f:
            f.write(self.conversation)
        f.close()

    # The console's waiter will route to this with the prompt
    async def prompt_ollama(self, message: Message):
        await self.channel_ollama_state.send(Message("Zipper-state", "[Starting]"))
        full_response = ""
        loop = asyncio.get_running_loop()

        def run_stream():
            for chunk in stream_ollama(self.conversation):
                asyncio.run_coroutine_threadsafe(
                    self.channel_ollama_stream.send(Message("Zipper-stream", chunk)),
                    loop
                )
                nonlocal full_response
                full_response += chunk

        await asyncio.to_thread(run_stream)

        await self.channel_ollama_state.send(Message("Zipper-state", "[Complete]"))
        await self.channel_ollama_output.send(Message("Zipper", full_response))
        self.add_to_conversation("\nZipper: " + full_response + "\n")

    async def add_to_conversation(self, message: Message):
        if not message.text: return
        self.conversation += f"{message.role}: {message.text}"
        self.save_conversation()
