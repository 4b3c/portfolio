with open("memory.txt", "r", encoding="utf-8") as f:
    long_term_memory = f.read().strip()

print(long_term_memory.split("\n\n")[1].strip())