import asyncio
from subsystem import Subsystem

# Publishes: User typed input in the console

class Console(Subsystem):

    def __init__(self) -> None:
        super().__init__("console")
        self.awaiting_input = None
        self.awaiting_interrupt = None

    async def input_loop(self):
        user_input = await asyncio.to_thread(input, "Abram: ")
        await self.publish(user_input)

    async def main_loop(self):
        while True:
            msg = await self.listen()
            if self.awaiting_input != None:
                self.awaiting_input.cancel()
            print(msg.message)
            self.awaiting_input = asyncio.create_task(self.input_loop())
