from modules.module import Module

class InterfaceModule(Module):
    """
    The interface module is the entry point for user interaction. It prompts the user for input and routes it to the appropriate module. It also handles displaying output from other modules back to the user.

    - "input" defines the message to display to the user. This is typically the output from another module that needs to be shown to the user, but could also be a custom message if the interface module is called directly.
    """

    def run(self, data) -> dict:
        user_input = input("User: ")

        if user_input.lower() in ["exit", "quit"]:
            print("Exiting interface.")
            return self.complete("User exited the session.")

        return self.call("router", user_input)
    
    def resume(self, data):
        print(data, "\n")
        return self.run(None)