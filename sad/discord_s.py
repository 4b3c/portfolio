from subsystem import Subsystem
import discord
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()
token = os.environ.get('token')
channel_id = int(os.environ.get('channel_id'))
abram_id = int(os.environ.get('abram_id'))

intents = discord.Intents.default()
intents.message_content = True


class DiscordBot(discord.Client):

    def __init__(self, subsystem: Subsystem, **kwargs) -> None:
        super().__init__(intents=intents, **kwargs)
        self.subsystem = subsystem
        self.ready_event = asyncio.Event()

    async def start(self) -> None:
        await super().start(token)

    async def on_ready(self) -> None:
        self.bot_channel = await self.fetch_channel(channel_id)
        self.ready_event.set()
    
    async def send_message(self, message) -> None:
        await self.ready_event.wait()
        if self.bot_channel:
            await self.bot_channel.send(message)

    async def on_message(self, message) -> None:
        if message.author.id == abram_id:
            await self.subsystem.publish(message.content)


# Publishes: User typed input from discord

class Discord(Subsystem):

    def __init__(self) -> None:
        super().__init__("discord")
        self.discord_bot = DiscordBot(self)
        self.bot_running = None
        self.listening = None

    async def start(self) -> list[asyncio.Task]:
        bot_task = asyncio.create_task(self.discord_bot.start())
        base_tasks = await super().start()
        return base_tasks + [bot_task]


    async def main_loop(self) -> None:
        while True:
            msg = await self.listen()
            await self.discord_bot.send_message(f"{msg.sender}: {msg.message}")
