import time
import subprocess
import platform

time.sleep(3)
if platform.system() == "Darwin":
    subprocess.Popen(["bash", "dizi.sh"], start_new_session=True)
elif platform.system() == "Windows":
    subprocess.Popen(["dizi.bat"], creationflags=subprocess.CREATE_NEW_CONSOLE)

