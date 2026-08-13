from __future__ import annotations

import argparse
import asyncio
import getpass
import os
import sys
from dataclasses import asdict
from typing import Sequence

from telethon import TelegramClient
from telethon.errors import FloodWaitError, PhoneCodeInvalidError, PhoneNumberInvalidError, SessionPasswordNeededError

from .scanner import TargetDialog, classify_dialog

APP_NAME = "Telegram Joined Cleaner"
DEFAULT_SESSION = "telegram_joined_cleaner"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="telegram-joined-cleaner",
        description="Safely find and remove Telegram's 'X joined Telegram' service-only dialogs.",
    )
    parser.add_argument("--api-id", type=int, default=None, help="Telegram API ID (or TG_API_ID).")
    parser.add_argument("--api-hash", default=None, help="Telegram API hash (or TG_API_HASH).")
    parser.add_argument("--session", default=DEFAULT_SESSION, help="Telethon session path/prefix.")
    parser.add_argument(
        "--scope",
        choices=("main", "all"),
        default="main",
        help="Scan non-archived/main dialogs by default; use 'all' to include Archive.",
    )
    parser.add_argument("--dry-run", action="store_true", help="List targets without deleting. Default behavior.")
    parser.add_argument("--delete", action="store_true", help="Actually delete matched dialogs after confirmation.")
    parser.add_argument("--yes", action="store_true", help="Skip the confirmation prompt; requires --delete.")
    parser.add_argument("--json", dest="json_path", help="Write a JSON report to this path.")
    parser.add_argument("--limit", type=int, default=None, help="Maximum dialogs to inspect (debug/testing).")
    return parser


def get_credentials(args: argparse.Namespace) -> tuple[int, str]:
    raw_id = args.api_id or os.getenv("TG_API_ID")
    raw_hash = args.api_hash or os.getenv("TG_API_HASH")

    if not raw_id:
        raw_id = input("Telegram API ID: ").strip()
    if not raw_hash:
        # Avoid putting secrets into shell history for the normal interactive path.
        raw_hash = getpass.getpass("Telegram API hash: ").strip()

    try:
        api_id = int(raw_id)
    except ValueError as exc:
        raise SystemExit("API ID must be an integer.") from exc

    if not raw_hash:
        raise SystemExit("API hash is required.")
    return api_id, raw_hash


async def authenticate(client: TelegramClient) -> None:
    await client.connect()
    if await client.is_user_authorized():
        return

    phone = input("Telegram phone number: ").strip()
    try:
        await client.send_code_request(phone)
    except PhoneNumberInvalidError as exc:
        raise SystemExit("Telegram rejected that phone number.") from exc

    code = input("Telegram login code: ").strip()
    try:
        await client.sign_in(phone=phone, code=code)
    except SessionPasswordNeededError:
        password = getpass.getpass("Telegram 2FA password: ")
        await client.sign_in(password=password)
    except PhoneCodeInvalidError as exc:
        raise SystemExit("Telegram rejected that login code.") from exc


def get_scope_folder(scope: str) -> int:
    # Telethon: folder=0 is non-archived dialogs; Archive is folder=1.
    return 0 if scope == "main" else None  # type: ignore[return-value]


async def scan(client: TelegramClient, scope: str, limit: int | None) -> tuple[list[TargetDialog], int]:
    targets: list[TargetDialog] = []
    inspected = 0
    folder = get_scope_folder(scope)

    async for dialog in client.iter_dialogs(folder=folder):
        inspected += 1
        if limit is not None and inspected > limit:
            break
        if not dialog.is_user:
            continue

        # Two-message lookahead makes a real conversation fail closed without
        # traversing its entire history. A genuine service-only dialog contains
        # one joined service message in normal Telegram behavior.
        recent = await client.get_messages(dialog.entity, limit=2)
        target = classify_dialog(dialog, recent)
        if target:
            targets.append(target)

    return targets, inspected


async def delete_targets(client: TelegramClient, targets: list[TargetDialog]) -> tuple[int, list[dict]]:
    deleted = 0
    failures: list[dict] = []
    for target in targets:
        try:
            await client.delete_dialog(target.entity, revoke=False)
            deleted += 1
        except FloodWaitError as exc:
            await asyncio.sleep(exc.seconds)
            try:
                await client.delete_dialog(target.entity, revoke=False)
                deleted += 1
            except Exception as retry_exc:  # pragma: no cover - network dependent
                failures.append({"title": target.title, "error": repr(retry_exc)})
        except Exception as exc:  # pragma: no cover - network dependent
            failures.append({"title": target.title, "error": repr(exc)})
    return deleted, failures


def write_report(path: str, *, targets: list[TargetDialog], inspected: int, deleted: int = 0, failures=None) -> None:
    import json

    payload = {
        "app": APP_NAME,
        "inspected_dialogs": inspected,
        "matched": len(targets),
        "deleted": deleted,
        "failures": failures or [],
        "targets": [asdict(item) for item in targets],
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.yes and not args.delete:
        raise SystemExit("--yes requires --delete.")
    if args.dry_run and args.delete:
        raise SystemExit("Choose either --dry-run or --delete.")

    api_id, api_hash = get_credentials(args)
    client = TelegramClient(args.session, api_id, api_hash)

    async def runner() -> int:
        await authenticate(client)
        try:
            me = await client.get_me()
            targets, inspected = await scan(client, args.scope, args.limit)
            print()
            print(f"Account: {getattr(me, 'first_name', '') or ''} (@{getattr(me, 'username', None) or 'no username'})")
            print(f"Dialogs inspected: {inspected}")
            print(f"Safe joined-Telegram targets: {len(targets)}")
            print(f"Scope: {'main/non-archived' if args.scope == 'main' else 'all dialogs including Archive'}")
            print()

            for target in targets:
                marker = " [deleted account]" if target.deleted else ""
                print(f"  {target.title}{marker} (user_id={target.user_id})")

            if args.json_path:
                write_report(args.json_path, targets=targets, inspected=inspected)
                print(f"\nReport written to {args.json_path}")

            if not args.delete:
                print("\nDry run only. Add --delete to remove these dialogs.")
                return 0

            if not targets:
                return 0

            if not args.yes:
                confirmation = input("\nType DELETE to remove ONLY these dialogs: ").strip()
                if confirmation != "DELETE":
                    print("Cancelled.")
                    return 0

            deleted, failures = await delete_targets(client, targets)
            print(f"\nDeleted: {deleted}")
            if failures:
                print(f"Failed: {len(failures)}")
                for failure in failures:
                    print(f"  {failure['title']}: {failure['error']}")

            if args.json_path:
                write_report(args.json_path, targets=targets, inspected=inspected, deleted=deleted, failures=failures)
            return 0 if not failures else 2
        finally:
            await client.disconnect()

    try:
        return asyncio.run(runner())
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
