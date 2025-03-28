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


class DiziBot(discord.Client):
    def __init__(self, incoming_queue, outgoing_queue, **kwargs):
        super().__init__(intents=intents, **kwargs)
        self.incoming_queue = incoming_queue
        self.outgoing_queue = outgoing_queue

    async def start(self):
        await super().start(token)
    
    async def send_message(self, message):
        await self.bot_channel.send(message)

    async def on_ready(self):
        self.bot_channel = self.get_channel(channel_id)

    async def on_message(self, message):
        if message.author.id == abram_id:
            print(f"(From Discord) {message.content}")
            await self.incoming_queue.put(f"(From Discord) {message.content}")

    async def message_loop(self):
        reply = await self.outgoing_queue.get()
        await self.send_message(reply)
