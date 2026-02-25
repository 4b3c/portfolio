import json
from modules.module import Module
from utils.claude import call_claude, OPUS
from utils.colors import print_reasoning, print_error

class ReasonModule(Module):
    """Think through a complex, multi-step problem using a powerful reasoning model before acting. Input: the question or task to reason through. Use this before taking action on anything non-trivial — architecture decisions, debugging strategies, planning sequences of edits, or any task where getting it wrong would be costly. Returns either a reasoned answer or a module call to execute next."""

    def run(self, data) -> dict:
        question = data["input"]
        registry = self.context.get("registry", {})
        modules_info = json.dumps({k: v for k, v in registry.items() if k != "reason"}, indent=2)

        system = f"""You are an expert reasoning assistant with access to a set of modules to act on your conclusions.

Think through the problem carefully and thoroughly, step by step, before giving your final answer.

You have NO built-in abilities to read files, run commands, or search the web. If your reasoning determines that an action needs to be taken, respond with ONLY a raw JSON object:
{{"module": "<module_name>", "input": "<input>"}}

Available modules:
{modules_info}

Otherwise, respond with your reasoned answer as plain text."""

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": question}
        ]
        print_reasoning("[thinking...]")
        try:
            answer = call_claude(messages, model=OPUS).strip()
            print_reasoning(answer)
            return self.complete(answer)
        except Exception as e:
            print_error("Reasoning error:", str(e))
            return self.fail(str(e))
