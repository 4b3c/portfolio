import requests
import subprocess
import re
import json

MODEL_NAME = "llama3.2"
OLLAMA_API_URL = "http://localhost:11434/api/generate"

# Load system instructions (personality, rules, tool syntax)
with open("instructions.txt", "r", encoding="utf-8") as f:
    system_instructions = f.read()

# Load persistent memory
try:
    with open("memory.txt", "r", encoding="utf-8") as f:
        long_term_memory = f.read().strip()
except FileNotFoundError:
    long_term_memory = ""

initial_prompt = system_instructions + long_term_memory + "\nSystem: You are now online. Say hi!\n"

conversation = [initial_prompt]

def query(prompt, stream=False):
    payload = {
        'model': MODEL_NAME,
        'prompt': prompt,
        'stream': stream,
        'options': {"temperature": 0.4}
    }
    response = requests.post(OLLAMA_API_URL, json=payload, stream=stream)

    if stream:
        for line in response.iter_lines():
            if line:
                data = json.loads(line.decode('utf-8'))
                print(data.get("response", ""), end='', flush=True)
        return ""
    else:
        if response.status_code == 200:
            return response.json().get('response', '').strip()
        else:
            return f"Error: {response.status_code} - {response.text}"

def detect_and_execute(assistant_reply):
    match = re.search(r"```(.*?)```", assistant_reply, re.DOTALL)
    if not match:
        return

    command_to_run = match.group(1).strip()
    if not command_to_run:
        return

    try:
        result = subprocess.run(command_to_run, shell=True, capture_output=True, text=True, timeout=5)
        output_text = result.stdout.strip()
        error_text = result.stderr.strip()
        if (len(output_text) > 300):
            output_text = output_text[:300] + "..."
        if (len(error_text) > 300):
            error_text = error_text[:300] + "..."
    except Exception as e:
        output_text = ""
        error_text = f"Error during execution: {e}"

    print(f"System: {output_text if output_text else error_text}")
    conversation.append(f"System: {output_text if output_text else error_text}")

# --- Main Loop ---

while True:
    convo_text = "\n".join(conversation)
    prompt = f"{convo_text}\nDizi:"

    dizi_reply = query(prompt, stream=False)
    conversation.append(f"Dizi: {dizi_reply}")
    
    print(f"Dizi: {dizi_reply}")
    detect_and_execute(dizi_reply)

    try:
        user_input = input("User: ")
        if user_input.strip().lower() == "exit": break
    except (EOFError, KeyboardInterrupt):
        break

    conversation.append(f"User: {user_input}")

print("\nExiting Dizi. Goodbye!")