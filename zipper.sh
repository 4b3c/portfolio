#!/bin/bash

osascript <<END
tell application "Terminal"
    do script "clear; cd ~/Desktop/ZSipper; source venv/bin/activate; python3 zipper.py"
    activate
end tell
END