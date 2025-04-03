import asyncio
from router import Channel, Router


class Subsystem:
    def __init__(self, name):
        self.name = name
        self._channels = []

    def create_channel(self, name=None):
        chan = Channel(name)
        self._channels.append(chan)
        asyncio.create_task(chan.start())
        return chan