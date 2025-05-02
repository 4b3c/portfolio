import discord
from discord.ext import commands
from gtts import gTTS
import os
import asyncio
from dotenv import load_dotenv


load_dotenv()
token = os.environ.get('token')

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix='!', intents=intents)

@bot.event
async def on_ready():
    print(f'Logged in as {bot.user.name}')

@bot.command(name="speak")
async def speak(ctx, *, text: str):
    # Check if user is in a voice channel
    if ctx.author.voice is None:
        await ctx.send("You must be in a voice channel.")
        return

    voice_channel = ctx.author.voice.channel

    # Join the voice channel
    vc = await voice_channel.connect()

    # Generate TTS audio
    tts = gTTS(text)
    tts.save("speech.mp3")

    # Play the audio
    vc.play(discord.FFmpegPCMAudio("speech.mp3"))

    # Wait until done
    while vc.is_playing():
        await asyncio.sleep(0.5)

    # Leave and clean up
    await vc.disconnect()
    os.remove("speech.mp3")

# Replace this with your bot token
bot.run(token)
