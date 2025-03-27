import sys
import random

if __name__ == "__main__":
    if len(sys.argv) >= 2:
        name = " ".join(sys.argv[1:])  # support multi-word names
        print(random.choice(["Hello", "Hi", "Hey"]) + ", " + name + "!")
    else:
        print("Hello!")
