import os
import time
import anthropic
from dotenv import load_dotenv
from utils.function_calls import first_completed_function_call_prefix, truncate_after_function_call

load_dotenv()

# Transient error types that should be retried
_RETRYABLE_ERROR_TYPES = {"overloaded_error", "rate_limit_error", "api_error"}
_MAX_RETRIES = 3
_BASE_DELAY = 2  # seconds

HAIKU = "claude-haiku-4-5"
SONNET = "claude-sonnet-4-5"
OPUS = "claude-opus-4-6"

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


class ClaudeRateLimitPause(RuntimeError):
    """Pause signal for rate-limit/overload responses that need user intervention."""


def _is_rate_limit_or_overload(error_type: str, error_text: str) -> bool:
    et = (error_type or "").lower()
    text = (error_text or "").lower()
    if et in {"rate_limit_error", "overloaded_error"}:
        return True
    return any(token in text for token in ("rate_limit_error", "overloaded_error", "429", "too many requests", "overloaded"))


def _extract_text_from_content(content) -> str:
    """Safely extract text from Anthropic content blocks."""
    if not content:
        return ""

    parts = []
    for block in content:
        text = getattr(block, "text", None)
        if isinstance(text, str):
            parts.append(text)
            continue
        if isinstance(block, dict):
            value = block.get("text")
            if isinstance(value, str):
                parts.append(value)
    return "".join(parts)


def call_claude(
    messages: list[dict],
    model: str = HAIKU,
    temperature: float = 0.2,
    stop: list[str] = None,
    on_token=None,
    timeout: float | None = None,
    max_tokens: int = 8096,
) -> str:
    system_parts = [m["content"] for m in messages if m["role"] == "system"]
    filtered = [m for m in messages if m["role"] != "system"]

    kwargs = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": filtered,
        "temperature": temperature,
    }
    if system_parts:
        kwargs["system"] = "\n".join(system_parts)
    if stop:
        kwargs["stop_sequences"] = stop
    if timeout is not None:
        kwargs["timeout"] = timeout

    last_error = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            if on_token:
                streamed_text = ""
                early = None
                with client.messages.stream(**kwargs) as stream:
                    for text in stream.text_stream:
                        streamed_text += text
                        on_token(text)
                        prefix = first_completed_function_call_prefix(streamed_text)
                        if prefix is not None:
                            early = prefix
                            break

                    if early is None:
                        final_message = stream.get_final_message()
                        text = _extract_text_from_content(getattr(final_message, "content", None))
                        return truncate_after_function_call(text)
                return truncate_after_function_call(early)
            else:
                response = client.messages.create(**kwargs)
                text = _extract_text_from_content(getattr(response, "content", None))
                return truncate_after_function_call(text)
        except anthropic.APIError as e:
            last_error = e
            error_type = getattr(getattr(e, "body", None), "get", lambda *a: None)("error", {}).get("type", "") if isinstance(getattr(e, "body", None), dict) else ""
            error_str = str(e)
            if _is_rate_limit_or_overload(error_type, error_str):
                raise ClaudeRateLimitPause(f"[CLAUDE RATE LIMIT] {e}")

            if not error_type:
                is_retryable = any(t in error_str for t in _RETRYABLE_ERROR_TYPES)
            else:
                is_retryable = error_type in _RETRYABLE_ERROR_TYPES

            if is_retryable and attempt < _MAX_RETRIES:
                delay = _BASE_DELAY * (2 ** attempt)
                print(f"[Claude] Transient error (attempt {attempt + 1}/{_MAX_RETRIES + 1}): {e}. Retrying in {delay}s...")
                time.sleep(delay)
                continue
            raise RuntimeError(f"[CLAUDE ERROR] {e}")


if __name__ == "__main__":
    test_messages = [
        {"role": "user", "content": "What is the capital of France?"}
    ]
    print(call_claude(test_messages))
