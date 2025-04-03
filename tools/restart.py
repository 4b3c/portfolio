import time
import subprocess
import platform


if platform.system() == "Darwin":
    subprocess.Popen(["bash", "zipper.sh"], start_new_session=True)
elif platform.system() == "Windows":
    subprocess.Popen(["zipper.bat"], creationflags=subprocess.CREATE_NEW_CONSOLE)

time.sleep(1)