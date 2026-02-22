from modules.module import Module
from utils.ollama import call_ollama
 


class AssistantModule(Module):
    """
    The assistant module is responsible for conversational tasks, answering questions, and providing help based on the input it receives. It can be used for a wide range of purposes, such as answering user queries, providing explanations, or assisting with tasks that don't fit into other specific modules.
    
    - "input" defines the task or question that the assistant should help with.
    """
    
    def run(self, data) -> dict:
        payload = data["input"]
        
        messages = [
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
            raw = call_ollama(messages).strip()
            print(f"Assistant: {raw}\n")
            if raw.lower() == "done":
                break
            messages.append({"role": "assistant", "content": raw})
            user_input = input("User (type 'done' to finish): ")
            if user_input.lower() == "done":
                break
            messages.append({"role": "user", "content": user_input})

        return self.complete("Assistant session completed.")
    
            