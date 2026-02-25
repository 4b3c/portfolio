import os
import anthropic
from dotenv import load_dotenv

load_dotenv()

HAIKU = "claude-haiku-4-5"
SONNET = "claude-sonnet-4-5"
OPUS = "claude-opus-4-6"

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


def call_claude(messages: list[dict], model: str = HAIKU, temperature: float = 0.2, stop: list[str] = None, on_token=None) -> str:
    system_parts = [m["content"] for m in messages if m["role"] == "system"]
    filtered = [m for m in messages if m["role"] != "system"]

    kwargs = {
        "model": model,
        "max_tokens": 8096,
        "messages": filtered,
        "temperature": temperature,
    }
    if system_parts:
        kwargs["system"] = "\n".join(system_parts)
    if stop:
        kwargs["stop_sequences"] = stop

    try:
        if on_token:
            with client.messages.stream(**kwargs) as stream:
                for text in stream.text_stream:
                    on_token(text)
            return stream.get_final_message().content[0].text
        else:
            response = client.messages.create(**kwargs)
            return response.content[0].text
    except anthropic.APIError as e:
        raise RuntimeError(f"[CLAUDE ERROR] {e}")


if __name__ == "__main__":
    test_messages = [
        {"role": "user", "content": "What is the capital of France?"}
    ]
    print(call_claude(test_messages))
