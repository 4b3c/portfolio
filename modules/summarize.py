from modules.module import Module
from utils.claude import call_claude
from utils.prompts import load_system_prompt

class SummarizeModule(Module):
    """Condense a long piece of text into a concise summary. Input: the text to summarize. Use this when content is too long to reason about directly — paste the raw text and get a summary back before proceeding."""

    def run(self, data) -> dict:
        text = data["input"]
        messages = [
            {"role": "system", "content": load_system_prompt("summarizer.md")},
            {"role": "user", "content": text}
        ]
        try:
            summary = call_claude(messages).strip()
            return self.complete(summary)
        except Exception as e:
            return self.fail(str(e))
