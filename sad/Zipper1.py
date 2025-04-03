import platform
import sys
import requests
import subprocess
import re
import json
import time
import asyncio
from discord_bot import ZipperBot
from aioconsole import ainput


MODEL_NAME = "llama3.2"
OLLAMA_API_URL = "http://localhost:11434/api/generate"

RED = "\033[91m"
GREEN = "\033[92m"
BLUE = "\033[94m"
YELLOW = "\033[93m"
PURPLE = "\033[95m"
RESET = "\033[0m"


# Load system instructions (personality, rules, tool syntax)
with open("instructions.txt", "r", encoding="utf-8") as f:
    system_instructions = f.read()
    system_instructions = system_instructions.replace("{{OS}}", platform.platform())

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
            'temperature': 0.25,
            'stop': ['System:', 'User:', 'Abram:', 'Output:']
            }
    }
    response = requests.post(OLLAMA_API_URL, json=payload, stream=True)

    full_reply = ""
    for line in response.iter_lines():
        if line:
            data = json.loads(line.decode('utf-8'))
            chunk = data.get("response", "")
            full_reply += chunk
            print(chunk, end='', flush=True)

    print()  # newline after streaming
    return full_reply.strip()

def detect_and_execute(assistant_reply, name):
    matches = re.findall(r"<<<(.*?)>>>", assistant_reply, re.DOTALL)
    if matches == None:
        return None
    
    output = ""
    for command_block in matches:
        command_to_run = command_block.strip()

        if not command_to_run:
            return None
        
        if "python restart.py" in command_to_run:
            print(f"{BLUE}System:{RESET} Restarting Zipper...")
            subprocess.Popen(["python", "restart.py"])
            sys.exit()

        try:
            result = subprocess.run(command_to_run, shell=True, capture_output=True, text=True, timeout=5)
            output_text = result.stdout.strip().replace("\n", "\n\t> ")
            error_text = result.stderr.strip().replace("\n", "\n\t> ")
        except Exception as e:
            output_text = ""
            error_text = f"Error during execution: {e}"

        if error_text:
            output += f"\n\t{name} ran:\n\t> {command_to_run}\n\tError:\n\t> {error_text}\n"
        else:
            output += f"\n\t{name} ran:\n\t> {command_to_run}\n\tOutput:\n\t> {output_text}\n"



    return output

async def read_terminal_input(incoming):
    user_input = await ainput(f"{PURPLE}Abram: {RESET}")
    await incoming.put(user_input)



async def Zipper_main():
    on_discord = False
    incoming = asyncio.Queue()
    outgoing = asyncio.Queue()

    discord_bot = ZipperBot(incoming, outgoing)
    asyncio.create_task(discord_bot.start())

    while True:
        convo_text = "\n".join(conversation)
        prompt = f"{convo_text}\nZipper:"
        print(f"{GREEN}Zipper:{RESET} ", end='', flush=True)

        Zipper_reply = query(prompt)
        conversation.append(f"Zipper: {Zipper_reply}")
        cmd_out = detect_and_execute(Zipper_reply, "Zipper")
        if on_discord:
            await discord_bot.send_message(Zipper_reply if Zipper_reply else "Empty response.")
            if cmd_out: await discord_bot.send_message(f"```Command output: {cmd_out}```")
        if cmd_out:
            print(f"{BLUE}System:{RED if "Error:" in cmd_out else YELLOW}{cmd_out}{RESET}", flush=True)
            conversation.append(f"System: {cmd_out}")
        
        
        # Open terminal and discord input streams
        terminal_input = asyncio.create_task(read_terminal_input(incoming))
        user_input = await incoming.get()
        terminal_input.cancel()

        conversation.append(f"Abram: {user_input}")
        cmd_out = detect_and_execute(user_input, "Abram")
        if cmd_out:
            print(f"{BLUE}System:{RED if "Error:" in cmd_out else YELLOW}{cmd_out}{RESET}", flush=True)
            conversation.append(f"System: {cmd_out}")
            if on_discord: await discord_bot.send_message(f"```Command output: {cmd_out}```")

        if "(From Discord)" in user_input:
            on_discord = True
        elif "exit" in user_input:
            break
        else:
            on_discord = False

    print("\nExiting Zipper. Goodbye!")
    await discord_bot.close()
    with open(f"conversations/{time.time()}.txt", "w") as f:
        f.write("\n".join(conversation))


if __name__ == "__main__":
    asyncio.run(Zipper_main())