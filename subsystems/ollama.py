from collections.abc import Generator
import platform
import time
import requests
import json
import asyncio
from .subsystem import Subsystem
from .router import Message

MODEL_NAME = "llama3.2"
OLLAMA_API_URL = "http://localhost:11434/api/chat"

def get_intructions():
    with open("prompts/instructions.txt", "r", encoding="utf-8") as f:
        instructions = f.read()
    return instructions.replace("{{OS}}", platform.platform())

def get_memory():
    with open("prompts/memory.txt", "r", encoding="utf-8") as f:
        memory = f.read()
    return memory

def stream_ollama(messages: list[dict[str, str]]) -> Generator[str, None, None]:
    payload = {
        'model': MODEL_NAME,
        'messages': messages,
        'stream': True,
        'options': {'temperature': 0.2, 'stop': ['(waiting for block execution)', '(awaiting block execution)','[terminal output]', '\n\n\n']}
    }
    try:
        response = requests.post(OLLAMA_API_URL, json=payload, stream=True)
        for raw_line in response.iter_lines(decode_unicode=True):
            if raw_line.strip():
                data = json.loads(raw_line)
                yield data.get("message", {}).get("content", "")

    # TODO: Fix this error handling
    except requests.RequestException as e:
        yield f"[OLLAMA ERROR] {e}"

class Ollama(Subsystem):
    def __init__(self):
        super().__init__("Ollama")
        self.conversation: list[dict[str, str]] = [
                {"role": "system", "content": get_intructions()},
                {"role": "assistant", "content": get_memory()},
                {"role": "user", "content": "Hi Zipper! I am Abram. You are my AI assistant, welcome back online!"}
            ]
        self.channel_ollama_stream = self.create_channel("ollama-stream")
        self.channel_ollama_state = self.create_channel("ollama-state")
        self.channel_ollama_output = self.create_channel("ollama-output")
        self.conversation_file = f"conversations/{time.time()}.json"

    def save_conversation(self):
        with open(self.conversation_file, "w") as f:
            json.dump(self.conversation, f, indent=4)

    # The console's waiter will route to this with the prompt
    async def prompt_ollama(self, message: Message):
        await self.channel_ollama_state.send(Message("Zipper-state", "[Starting]"))
        full_response = ""
        loop = asyncio.get_running_loop()
        await self.add_to_conversation(message)

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
        await self.add_to_conversation(Message("Zipper", full_response))

    async def add_to_conversation(self, message: Message):
        if not message.text: return
        if message.role == "System":
            self.conversation.append({"role": "assistant", "content": "[terminal output](START)\n" + message.text + "\n[terminal output](END)"})
        elif message.role == "Abram":
            self.conversation.append({"role": "user", "content": message.text})
        elif message.role == "Zipper":
            self.conversation.append({"role": "assistant", "content": message.text})
        else:
            raise ValueError(f"Unknown role in message: {message.role}")
        self.save_conversation()