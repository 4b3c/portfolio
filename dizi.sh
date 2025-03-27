#!/bin/bash

osascript <<END
tell application "Terminal"
    do script "clear; cd ~/Desktop/dizi; source venv/bin/activate; python3 dizi.py"
    activate
end tell
END