#!/usr/bin/env python3
"""Backward-compatible single-file entry point."""
from tg_joined_cleaner.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
