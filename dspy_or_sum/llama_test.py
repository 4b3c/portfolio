import requests
import json

MODEL = "llama3.2"
URL = "http://localhost:11434/api/chat"

messages = [
    {"role": "system", "content": "You are Zipper, a smart AI assistant."},
    {"role": "user", "content": "Say something :)"}
]

payload = {
    "model": MODEL,
    "messages": messages,
    "stream": True,
    'options': {'temperature': 0.2, 'stop': ['System:', 'Abram:', 'Output:']}
}

print("Streaming response:\n")

response = requests.post(URL, json=payload, stream=True)

# Initialize an empty string to collect the full response
full_response = ""

for raw_line in response.iter_lines(decode_unicode=True):
    if not raw_line.strip():
        continue
    try:
        data = json.loads(raw_line)
        chunk = data.get("message", {}).get("content", "")
        full_response += chunk  # Aggregate the chunks
        print(chunk, end="", flush=True)  # Print as we go
    except json.JSONDecodeError:
        print(f"\n[Bad JSON Line]: {raw_line}")

print()
