#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3 telegram_joined_cleaner.py "$@"
