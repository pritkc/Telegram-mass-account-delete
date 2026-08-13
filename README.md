# Telegram Joined Cleaner

As of August 2026, Telegram does not provide a reliable **Select All** action for the full chat list on iOS, Android, and macOS, and it does not offer a setting to disable the **“X joined Telegram”** service-chat creation. Telegram does provide **Delete Synced Contacts** in the official mobile apps. 

This utility uses Telegram's user API (MTProto) to find dialogs containing only Telegram's structural `MessageActionContactSignUp` service message and delete those dialogs without touching normal chats, groups, channels, or bots.

## Run

```bash
python3 -m pip install -r requirements.txt
python3 telegram_joined_cleaner.py --api-id YOUR_API_ID --api-hash YOUR_API_HASH --dry-run
python3 telegram_joined_cleaner.py --api-id YOUR_API_ID --api-hash YOUR_API_HASH --delete
```

By default it scans only the **main/non-archived** dialogs. Use `--scope all` to include Archive. The normal interactive path can prompt for API credentials instead of putting the hash on the command line.

First run asks for the Telegram login code and 2FA password when required. The local Telethon session file is sensitive; do not upload or commit it.

Deleted Telegram accounts are shown as `*deleted account`.

## Stop new joined messages

In Telegram mobile: **Settings → Privacy & Security → Data Settings → Delete Synced Contacts**, then turn **Sync Contacts** off. Telegram documents that this removes synced contacts from its servers; with syncing enabled, contacts can be re-synced and can trigger join notifications. 

The script intentionally does **not** imitate this by deleting every Telegram contact: Telegram's API contact-deletion methods can remove actual contacts, which is broader and unsafe. Use Telegram's own **Delete Synced Contacts** control for that operation.

## Safety

Default mode is dry-run. Deletion requires `--delete` and a `DELETE` confirmation unless `--yes` is supplied. Detection is fail-closed: a dialog is targeted only when the inspected history is exactly one `MessageActionContactSignUp` service message. `--scope main` excludes Archive.

## API credentials

Create credentials at <https://my.telegram.org/apps>. API hashes are secrets. Passing `--api-hash` exposes the value to shell history/process inspection; prefer the interactive prompt or environment variables for shared machines.

## License

MIT
