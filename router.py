import asyncio

class Router:
    def route(self, source_channel):
        return RouteBuilder(source_channel)


class RouteBuilder:
    def __init__(self, source_channel):
        self.source_channel = source_channel

    def to(self, target_callback):
        self.source_channel.connect(target_callback)
        return self


class Channel:
    def __init__(self, name):
        self.name = name
        self._queue = asyncio.Queue()
        self._listeners = []

    async def send(self, data):
        await self._queue.put(data)
        # print(f"[Channel] {self.name} is sending data: {data}\n")

    def connect(self, callback):
        self._listeners.append(callback)

    async def start(self):
        while True:
            data = await self._queue.get()
            for callback in self._listeners:
                asyncio.create_task(callback(data))
