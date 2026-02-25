from modules.module import Module

class InterfaceModule(Module):
    """Collects user input and forwards it to the router. Displays returned output to the user."""

    def run(self, data) -> dict:
        user_input = input("User: ")

        if user_input.lower() in ["exit", "quit"]:
            print("Exiting interface.")
            return self.complete("User exited the session.")

        return self.call("router", user_input)
    
    def resume(self, data):
        print(data, "\n")
        return self.complete(f"Completed session with output: {data}")