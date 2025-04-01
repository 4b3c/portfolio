import subprocess
import sys

message = sys.argv[1]

subprocess.run(['git', 'add', '.'], check=True)
subprocess.run(['git', 'commit', '-m', message], check=True)
subprocess.run(['git', 'push', 'origin', 'main'], check=True)