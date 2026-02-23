import json
from time import time
from modules.module import Module
from utils.ollama import call_ollama

CONVERSATIONS_PATH = "data/conversations"


def save_conversation(messages, path="unnamed.json"):
    path = f"{CONVERSATIONS_PATH}/{path}"
    with open(path, "w") as f:
        json.dump(messages, f, indent=2)

class AssistantModule(Module):
    """
    The assistant module is responsible for conversational tasks, answering questions, and providing help based on the input it receives. It can be used for a wide range of purposes, such as answering user queries, providing explanations, or assisting with tasks that don't fit into other specific modules.
    
    - "input" defines the task or question that the assistant should help with.
    """

    def __init__(self, context_path):
        super().__init__(context_path)
        self.messages = []
        self.conversation_id = (str(int(time())) + "0")[-6:-1]
    
    def run(self, data) -> dict:
        payload = data["input"]
        
        self.messages = [
            {
                "role": "system", "content": f"""
                    You are a helpful assistant named Zipper. Your job is to help with any task or question the user has. Respond in a clear and concise manner, providing useful information or guidance based on the user's input. If the user asks a question, provide a direct answer. If the user asks for help with a task, provide step-by-step instructions or relevant information to assist them. If the conversation is complete respond with only the word "done" and nothing else.
                """
            },
            {
                "role": "user", "content": payload
            }
        ]

        while True:
            
            # Call the Ollama API with the current conversation messages
            raw = call_ollama(self.messages).strip()
            self.messages.append({"role": "assistant", "content": raw})
            print(f"Assistant: {raw}\n")
            if raw.lower() == "done":
                break
            
            # Prompt the user for input and add it to the conversation messages
            user_input = input("User (type 'done' to finish): ")
            self.messages.append({"role": "user", "content": user_input})
            if user_input.lower() == "done":
                break
            
            # Save the conversation after each exchange
            save_conversation(self.messages, path=f"{self.conversation_id}.json")
        
        # Save the final conversation when done
        save_conversation(self.messages, path=f"{self.conversation_id}.json")


        return self.complete("Assistant session completed.")
    
            