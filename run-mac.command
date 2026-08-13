#!/bin/zsh
cd "$(dirname "$0")"
python3 telegram_joined_cleaner.py
read -k 1 "?Press any key to close..."
