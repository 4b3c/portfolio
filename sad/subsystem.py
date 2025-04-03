import asyncio
from port import Message, Port

class Subsystem:

    def __init__(self, name: str) -> None:
        self.name = name
        self.publish_port = Port(name)
        self.subscriptions: dict[str, asyncio.Queue] = {}

    # A function to start the subsytem
    async def start(self) -> list[asyncio.Task]:
        return [asyncio.create_task(self.main_loop())]

    # Subscribes this subsystem to a secondary subsystem's publish port to listen for messages
    def subscribe(self, port: Port) -> asyncio.Queue:
        self.subscriptions[port.name] = port.subscribe(self.name)
        return self.subscriptions[port.name]

    # Unsubscribes this subsystem from a secondary subsystem's publish port
    def unsubscribe(self, port: Port) -> bool:
        if port.unsubscribe(self.name):
            self.subscriptions.pop(port.name)
            return True
        return False

    # Publishes a message to the publish port for all subscribers listening
    async def publish(self, message: str) -> None:
        await self.publish_port.publish_message(message)

    # Listens to all the ports this subsystem is subscribed to, returns the first result
    async def listen(self) -> Message:
        while not self.subscriptions:
            await asyncio.sleep(0.1)

        get_tasks = [asyncio.create_task(queue.get()) for queue in self.subscriptions.values()]
        done, pending = await asyncio.wait(get_tasks, return_when=asyncio.FIRST_COMPLETED)

        for task in pending: task.cancel()
        return next(iter(done)).result()
    
    async def main_loop(self) -> None:
        await self.publish("Warning: main_loop not implemented.")
        while True:
            await asyncio.sleep(1)

