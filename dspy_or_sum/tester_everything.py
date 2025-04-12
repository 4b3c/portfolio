
# text = "/send_file tools/3d_printer/snapshots/snapshot.jpg hello welcome"
# filename = text.split("/send_file ")[1].split(" ")[0].strip()
# print(filename)

import asyncio
from aioconsole import ainput

async def main():
    while True:
        print(">>> ", end="", flush=True)
        try:
            text = asyncio.create_task(ainput())
            asyncio.sleep(0.1)  # Simulate some processing delay
            print(f"You typed: {text}")
            text.cancel()  # Cancel the input task
            print(f"You typed: {text}")
            text = asyncio.create_task(ainput())
            print(f"You typed: {text}")
        except asyncio.CancelledError:
            print("[Cancelled]")
            break

asyncio.run(main())
