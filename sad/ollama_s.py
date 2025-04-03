from collections.abc import Generator
import requests
import json
import asyncio
from port import Message, Port
from subsystem import Subsystem

MODEL_NAME = "llama3.2"
OLLAMA_API_URL = "http://localhost:11434/api/generate"

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

# Publishes: Ollama output given a prompt

class Ollama(Subsystem):

    def __init__(self) -> None:
        super().__init__("ollama")
        self.stream = Port("ollama-stream")

    # The main loop simply waits for prompts, handles them and repeats
    async def main_loop(self):
        while True:
            msg = await self.listen()
            await self.handle_prompt(msg.message)

    # Send a prompt to ollama, stream the output to a port, and publishing the full message on the main port
    async def handle_prompt(self, prompt: str):
        full_text = ""
        for chunk in stream_ollama(prompt):
            await self.stream.publish_message(chunk)
            full_text += chunk
        await self.publish(full_text)

