import sys

if __name__ == "__main__":
    # Take the memory item from command-line arguments
    if len(sys.argv) < 2:
        sys.exit(1)  # no input provided
    memory_item = sys.argv[1]
    # If the item itself might contain spaces or is quoted, join all arguments
    if len(sys.argv) > 2:
        memory_item = " ".join(sys.argv[1:])
    # Append the memory item to memory.txt
    with open("memory.txt", "a", encoding="utf-8") as memfile:
        memfile.write("- " + memory_item.strip() + "\n")
        print(f"Successfully remembered: '{memory_item}'")
