import time
import subprocess
import platform


if platform.system() == "Darwin":
    subprocess.Popen(["bash", "Zipper.sh"], start_new_session=True)
elif platform.system() == "Windows":
    subprocess.Popen(["Zipper.bat"], creationflags=subprocess.CREATE_NEW_CONSOLE)

time.sleep(1)