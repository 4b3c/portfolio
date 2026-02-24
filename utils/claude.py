import os
import anthropic
from dotenv import load_dotenv

load_dotenv()

MODEL_NAME = "claude-opus-4-6"

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


def call_claude(messages: list[dict], temperature: float = 0.2, stop: list[str] = None) -> str:
    system_parts = [m["content"] for m in messages if m["role"] == "system"]
    filtered = [m for m in messages if m["role"] != "system"]

    kwargs = {
        "model": MODEL_NAME,
        "max_tokens": 8096,
        "messages": filtered,
        "temperature": temperature,
    }
    if system_parts:
        kwargs["system"] = "\n".join(system_parts)
    if stop:
        kwargs["stop_sequences"] = stop

    try:
        response = client.messages.create(**kwargs)
        return response.content[0].text
    except anthropic.APIError as e:
        raise RuntimeError(f"[CLAUDE ERROR] {e}")


if __name__ == "__main__":
    test_messages = [
        {"role": "user", "content": "What is the capital of France?"}
    ]
    print(call_claude(test_messages))
