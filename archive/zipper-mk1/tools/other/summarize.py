from tools.tool import Tool
from utils.claude import call_claude
from utils.prompts import load_system_prompt

class SummarizeTool(Tool):
    """Condense long text into a concise summary.

    Input contract: `data["input"]` is a plain text string to summarize.
    """

    def run(self, data) -> dict:
        text = self.input_text(data)
        messages = [
            {"role": "system", "content": load_system_prompt("summarizer.md")},
            {"role": "user", "content": text}
        ]
        try:
            summary = call_claude(messages).strip()
            return self.complete(summary)
        except Exception as e:
            return self.fail(str(e))
