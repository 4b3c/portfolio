import os


def load_system_prompt(filename: str, replacements: dict | None = None) -> str:
    root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
    prompt_path = os.path.join(root, "system_prompts", filename)
    with open(prompt_path, encoding="utf-8") as f:
        content = f.read().strip()

    if replacements:
        for key, value in replacements.items():
            content = content.replace(f"{{{{{key}}}}}", str(value))
    return content
