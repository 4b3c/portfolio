import sys

if __name__ == "__main__":
    if len(sys.argv) >= 2:
        name = " ".join(sys.argv[1:])  # support multi-word names
        print(f"Hello, {name}!")
    else:
        print("Hello!")
