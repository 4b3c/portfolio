import subprocess

output = subprocess.run(['windows\\toggle_hotspot.bat'], shell=True, capture_output=True, text=True).stdout.strip()
print(f"Hotspot is now: {'Off' if 'On' in output else 'On'}")