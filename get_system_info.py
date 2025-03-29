import platform
import sys
import socket
import psutil
import shutil
import datetime

print("SYSTEM INFORMATION")
print("=" * 40)

# OS info
print(f"Datetime:     {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"OS:           {platform.platform()}")
print(f"Hostname:     {socket.gethostname()}")
print(f"IP Address:   {socket.gethostbyname(socket.gethostname())}")

# CPU info
print("\nCPU INFO")
print("=" * 40)
print(f"CPU Cores:    {psutil.cpu_count(logical=False)} (Physical)")
print(f"CPU Usage:    {psutil.cpu_percent(interval=1)}%")

# Memory info
print("\nMEMORY")
print("=" * 40)
mem = psutil.virtual_memory()
print(f"Total:        {mem.total / (1024**3):.2f} GB")
print(f"Available:    {mem.available / (1024**3):.2f} GB")
print(f"Used:         {mem.used / (1024**3):.2f} GB")
print(f"Percent:      {mem.percent}%")

# Disk info
print("\nDISK")
print("=" * 40)
disk = shutil.disk_usage("/")
print(f"Total:        {disk.total / (1024**3):.2f} GB")
print(f"Used:         {disk.used / (1024**3):.2f} GB")
print(f"Free:         {disk.free / (1024**3):.2f} GB")

# Python info
print("\nPYTHON")
print("=" * 40)
print(f"Python Version: {sys.version}")
