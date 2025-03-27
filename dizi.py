import requests
import subprocess
import re
import json
import time
import asyncio
from discord_bot import DiziBot
from aioconsole import ainput


MODEL_NAME = "llama3.2"
OLLAMA_API_URL = "http://localhost:11434/api/generate"

RED = "\033[91m"
GREEN = "\033[92m"
BLUE = "\033[94m"
RESET = "\033[0m"


# Load system instructions (personality, rules, tool syntax)
with open("instructions.txt", "r", encoding="utf-8") as f:
    system_instructions = f.read()

# Load persistent memory
try:
    with open("memory.txt", "r", encoding="utf-8") as f:
        long_term_memory = f.read().strip()
except FileNotFoundError:
    long_term_memory = ""


initial_prompt = system_instructions + long_term_memory + "\nSystem: You are now online. Say hi to Abram!\n"
conversation = [initial_prompt]


def query(prompt):
    payload = {
        'model': MODEL_NAME,
        'prompt': prompt,
        'stream': True,
        'options': {
            'temperature': 0.2,
            'stop': ['System:', 'User:', 'Abram:', 'Output:'],
            'max_tokens': 100
            }
    }
    response = requests.post(OLLAMA_API_URL, json=payload, stream=True)

    full_reply = ""
    for line in response.iter_lines():
        if line:
            data = json.loads(line.decode('utf-8'))
            chunk = data.get("response", "")
            print(chunk, end='', flush=True)
            full_reply += chunk
    print()  # newline after streaming
    return full_reply.strip()

def detect_and_execute(assistant_reply, name):
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
    except Exception as e:
        output_text = ""
        error_text = f"Error during execution: {e}"

    print(f"{BLUE}System:{RESET} {name} ran a command. Command output: [{output_text if output_text else error_text}]")
    conversation.append(f"System: {name} ran a command. Command output: [{output_text if output_text else error_text}]")

async def read_terminal_input(incoming):
    user_input = await ainput(f"{RED}Abram: {RESET}")
    await incoming.put(user_input)



async def dizi_main():
    incoming = asyncio.Queue()
    outgoing = asyncio.Queue()

    discord_bot = DiziBot(incoming, outgoing)
    asyncio.create_task(discord_bot.start())

    while True:
        convo_text = "\n".join(conversation)
        prompt = f"{convo_text}\nDizi:"
        print(f"{GREEN}Dizi:{RESET} ", end='', flush=True)

        dizi_reply = query(prompt)
        conversation.append(f"Dizi: {dizi_reply}")
        detect_and_execute(dizi_reply, "Dizi")
        
        # Open terminal and discord input streams
        terminal_input = asyncio.create_task(read_terminal_input(incoming))
        user_input = await incoming.get()
        terminal_input.cancel()

        conversation.append(f"Abram: {user_input}")
        detect_and_execute(user_input, "Abram")

        if "(From Discord)" in user_input:
            await discord_bot.bot_channel.send(dizi_reply)
        elif user_input.lower() in ("exit", "quit"):
            break

    print("\nExiting Dizi. Goodbye!")
    with open(f"conversations/{time.time()}.txt", "w") as f:
        f.write("\n".join(conversation))


if __name__ == "__main__":
    asyncio.run(dizi_main())