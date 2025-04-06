from .subsystem import Subsystem
from .router import Channel, Message
from discord import Intents, Client, TextChannel
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

    def __init__(self, internal_channel, **kwargs) -> None:
        super().__init__(intents=intents, **kwargs)
        self.internal_channel: Channel = internal_channel
        self.bot_channel: TextChannel = None
        self.disabled = True

    async def start(self) -> None:
        await super().start(token)

    async def on_ready(self) -> None:
        self.bot_channel = self.get_channel(channel_id)
    
    async def send_message(self, message) -> None:
        if self.bot_channel and message.strip():
            await self.bot_channel.send(message[:1999])

    async def on_message(self, message) -> None:
        if message.author.id == abram_id:
            self.disabled = False
            await self.internal_channel.send(Message("Discord", message.content))



class Discord(Subsystem):
    def __init__(self):
        super().__init__("Discord")
        self.channel_user_input = self.create_channel("user-input")

        self.discord_bot = DiscordBot(self.channel_user_input)
        asyncio.create_task(self.discord_bot.start())

    # Console will route to this
    async def toggle(self, message: Message):
        if "[Enable]" in message.text:
            self.discord_bot.disabled = False
        elif "[Disable]" in message.text:
            self.discord_bot.disabled = True

    # Ollama output will route to this
    async def ollama_output(self, message: Message):
        if self.discord_bot.disabled: return
        await self.discord_bot.send_message(message.text)

    # Ollama's Actions will route to this
    async def ollama_actions_output(self, message: Message):
        if self.discord_bot.disabled: return
        await self.discord_bot.send_message(message.role + ": " + message.text)

    # My Actions will route to this
    async def my_actions_output(self, message: Message):
        if self.discord_bot.disabled: return
        await self.discord_bot.send_message(message.role + ": " + message.text)