import requests
import json

OLLAMA_API_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "llama3.2"

def call_ollama(messages: list[dict], temperature: float = 0.2, stop: list[str] = None) -> str:
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": temperature,
            **({"stop": stop} if stop else {})
        }
    }

    try:
        response = requests.post(OLLAMA_API_URL, json=payload)
        response.raise_for_status()
        return response.json().get("message", {}).get("content", "")
    except requests.RequestException as e:
        raise RuntimeError(f"[OLLAMA ERROR] {e}")
    


if __name__ == "__main__":
    test_messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What is the capital of France?"}
    ]
    print(call_ollama(test_messages))