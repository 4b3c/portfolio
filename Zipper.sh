#!/bin/bash

osascript <<END
tell application "Terminal"
    do script "clear; cd ~/Desktop/Zipper; source venv/bin/activate; python3 Zipper.py"
    activate
end tell
END