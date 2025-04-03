import asyncio


class Message:

    def __init__(self, sender: str, message: str) -> None:
        self.sender = sender
        self.message = message


class Port:

    def __init__(self, name: str) -> None:
        self.name = name
        self.subscribers: dict[str, asyncio.Queue] = {}

    # Adds a subsciber and returns the queue to access messages
    def subscribe(self, name: str) -> asyncio.Queue:
        new_queue = asyncio.Queue()
        self.subscribers[name] = new_queue
        return new_queue
    
    # Removes a subscriber from the port, returns if it was successful
    def unsubscribe(self, name: str) -> bool:
        if not name in self.subscribers:
            return False
        self.subscribers.pop(name)
        return True
    
    # Publishes a message to all subscribers' queues, returns a dict of successes
    async def publish_message(self, message: str) -> dict[str, bool]:
        success = {}
        for name, queue in self.subscribers.items():
            if queue.full():
                success[name] = False
            else:
                await queue.put(Message(self.name, message))
                success[name] = True
        return success
    
    # Sets up forwarding from one port to another (create a task, this runs forever)
    async def forward_to(self, name: str, port: "Port") -> None:
        queue = port.subscribe(name)
        while True:
            await self.publish_message(await queue.get().message)