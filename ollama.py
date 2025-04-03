from collections.abc import Generator
import requests
import json
import asyncio
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

class Ollama(Subsystem):
    def __init__(self):
        super().__init__("Ollama")
        self.channel_ollama_stream = self.create_channel("ollama_stream")
        self.channel_ollama_state = self.create_channel("ollama_state")
        self.channel_ollama_output = self.create_channel("ollama_output")

    # The console's waiter will route to this with the prompt
    async def prompt_ollama(self, data):
        await self.channel_ollama_state.send("[Starting]")
        full_response = ""
        loop = asyncio.get_running_loop()

        def run_stream():
            for chunk in stream_ollama(data):
                asyncio.run_coroutine_threadsafe(
                    self.channel_ollama_stream.send(chunk),
                    loop
                )
                nonlocal full_response
                full_response += chunk

        await asyncio.to_thread(run_stream)

        await self.channel_ollama_state.send("[Complete]")
        await self.channel_ollama_output.send(full_response)
