import asyncio
from port import Port
from subsystem import Subsystem
from actions_s import Actions
from console_s import Console
from discord_s import Discord
from ollama_s import Ollama

class Zipper(Subsystem):
    def __init__(self):
        super().__init__("zipper")
        self.discord_active = False
        self.console_state = "streaming"

        self.actions: Actions = Actions()
        self.actions_queue = self.subscribe(self.actions.publish_port)
        self.discord: Discord = Discord()
        self.discord_queue = self.subscribe(self.discord.publish_port)
        self.ollama: Ollama = Ollama()
        self.ollama_queue = self.subscribe(self.ollama.publish_port)
        self.ollama_stream = self.subscribe(self.ollama.stream)


        self.ollama.subscribe(self.discord.publish_port)
        self.discord.subscribe(self.ollama.publish_port)

    async def start(self):
        tasks = await super().start()  # Zipper's main_loop
        tasks += await self.actions.start()
        tasks += await self.discord.start()
        tasks += await self.ollama.start()
        
        await asyncio.gather(*tasks)


    async def main_loop(self):
        while True:
            msg = await self.listen()
            if msg.sender == "discord":
                self.discord_active = True
                print(f"[Discord]: {msg.message}")
            elif msg.sender == "ollama-stream":
                self.console_state = "streaming"
                print(msg.message, end="", flush=True)


if __name__ == "__main__":
    zipper = Zipper()
    asyncio.run(zipper.start())














    #     self.secondary_ports: dict[str, Port] = {}
    #     self.subsystems: dict[str, Subsystem] = {}
    #     self.subsystem_tasks: dict[str, asyncio.Task] = {}
    #     self.subsystem_queues: dict[str, asyncio.Queue] = {}

    # # Establishes a line of communication between Zipper and a subsystem
    # def establish_communication(self, subsystem: Subsystem):
    #     s_name = subsystem.name
    #     queue = self.subscribe(subsystem.publish_port) # Subscribe to the subsystem
    #     self.subsystems[s_name] = subsystem
    #     self.subsystem_queues[s_name] = queue
    #     private_port = Port("zipper-" + s_name) # Establish a private port
    #     self.secondary_ports[s_name] = private_port
    #     self.subsystems[s_name].subscribe(private_port) # Subscribe the subsystem to the private port

    #     self.subsystem_tasks[s_name] = asyncio.create_task(subsystem.start())

    # async def start(self) -> list[asyncio.Task]:

    #     # Estalish lines of communication with all the subsystems, and start them
    #     self.establish_communication(Actions())
    #     self.establish_communication(Console())
    #     self.establish_communication(Discord())
    #     self.establish_communication(Ollama())

    #     self.self.subsystems["ollama"].stream.subscribe("zipper-ollama-stream")


 