import requests
import json

def query_ollama(prompt, model='llama3.2'):
    response = requests.post(
        'http://localhost:11434/api/generate',
        json={
            'model': model,
            'prompt': prompt,
            'stream': False
        }
    )
    if response.status_code == 200:
        return response.json()['response']
    else:
        return f"Error: {response.status_code} - {response.text}"

def stream_ollama(prompt, model='llama3.2'):
    response = requests.post(
        'http://localhost:11434/api/generate',
        json={
            'model': model,
            'prompt': prompt,
            'stream': True
        },
        stream=True
    )
    
    for line in response.iter_lines():
        if line:
            data = json.loads(line.decode('utf-8'))
            print(data.get("response", ""), end='', flush=True)


# Example usage
response = query_ollama("What's your personality like?")
print(response)
stream_ollama("Write me a haiku about 3D printers.")
