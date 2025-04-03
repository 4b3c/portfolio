from subsystem import Subsystem
from discord import Intents, Client
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()
token = os.environ.get('token')
channel_id = int(os.environ.get('channel_id'))
abram_id = int(os.environ.get('abram_id'))

intents = Intents.default()
intents.message_content = True


class DiscordBot(Client):

    def __init__(self, channel, **kwargs) -> None:
        super().__init__(intents=intents, **kwargs)
        self.channel = channel
        self.disabled = True

    async def start(self) -> None:
        await super().start(token)

    async def on_ready(self) -> None:
        self.bot_channel = self.get_channel(channel_id)
    
    async def send_message(self, message) -> None:
        if self.bot_channel and message.strip():
            await self.bot_channel.send(message)

    async def on_message(self, message) -> None:
        if message.author.id == abram_id:
            self.disabled = False
            await self.channel.send(message.content)



class Discord(Subsystem):
    def __init__(self):
        super().__init__("Discord")
        self.channel_user_input = self.create_channel("user_input")

        self.discord_bot = DiscordBot(self.channel_user_input)
        asyncio.create_task(self.discord_bot.start())

    # Console will route to this
    async def toggle(self, data):
        if "[Enable]" in data:
            self.discord_bot.disabled = False
        elif "[Disable]" in data:
            self.discord_bot.disabled = True

    # Ollama output will route to this
    async def ollama_output(self, data):
        if self.discord_bot.disabled: return
        await self.discord_bot.send_message(data)

    # Ollama's Actions will route to this
    async def ollama_actions_output(self, data):
        if self.discord_bot.disabled: return
        await self.discord_bot.send_message(data)

    # My Actions will route to this
    async def my_actions_output(self, data):
        if self.discord_bot.disabled: return
        await self.discord_bot.send_message(data)