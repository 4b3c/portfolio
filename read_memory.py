with open("memory.txt", "r", encoding="utf-8") as f:
    long_term_memory = f.read().strip()

print("Memories:\n" + long_term_memory[257:])