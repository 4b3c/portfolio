from modules.module import Module
from utils.claude import call_claude

class SummarizeModule(Module):
    """Summarizes a long piece of text concisely. Input: the text to summarize."""

    def run(self, data) -> dict:
        text = data["input"]
        messages = [
            {"role": "system", "content": "You are a concise summarizer. Summarize the given text clearly and briefly, preserving the key information."},
            {"role": "user", "content": text}
        ]
        try:
            summary = call_claude(messages).strip()
            return self.complete(summary)
        except Exception as e:
            return self.fail(str(e))
