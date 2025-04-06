import asyncio
from subsystems import *

async def main():
    router = Router()

    # Create subsystems
    console = Console()
    my_actions = Actions()
    my_waiter = Waiter()
    ollama = Ollama()
    ollama_actions = Actions()
    ollama_waiter = Waiter()
    discord = Discord()
    
    # Route console
    router.route(console.channel_user_input).to(my_waiter.receive_input)
    router.route(console.channel_user_input).to(my_actions.command_input)
    router.route(my_actions.channel_command_output).to(my_waiter.receive_output)

    # Route ollama
    router.route(my_waiter.channel_combined).to(ollama.prompt_ollama)
    router.route(ollama.channel_ollama_state).to(console.ollama_state)
    router.route(ollama.channel_ollama_stream).to(console.stream)
    router.route(ollama.channel_ollama_output).to(ollama_waiter.receive_input)
    router.route(ollama.channel_ollama_output).to(ollama_actions.command_input)
    router.route(ollama_actions.channel_command_output).to(ollama_waiter.receive_output)

    # Route discord
    router.route(my_waiter.channel_command_output).to(discord.my_actions_output)
    router.route(my_waiter.channel_command_output).to(console.my_actions_output)
    router.route(ollama.channel_ollama_output).to(discord.ollama_output)
    router.route(ollama_waiter.channel_command_output).to(discord.ollama_actions_output)
    router.route(ollama_waiter.channel_command_output).to(console.ollama_actions_output)
    router.route(discord.channel_user_input).to(console.discord_interrupt)

    await asyncio.sleep(1)
    print("Starting Zipper...")
    await ollama.prompt_ollama("")

    # Keep alive forever
    while True:
        await asyncio.sleep(3600)

    
asyncio.run(main())
