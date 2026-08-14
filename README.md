# Telegram Joined Cleaner

As of August 2026, Telegram does not provide a reliable **Select All** action for the full chat list on iOS, Android, and macOS, and it does not offer a setting to disable the **“X joined Telegram”** service-chat creation. Telegram does provide **Delete Synced Contacts** in the official mobile apps.

This project finds dialogs containing **only** Telegram’s structural `MessageActionContactSignUp` service message and deletes those dialogs from **your** account without touching normal chats, groups, channels, or bots.

## Mobile web app (recommended)

Open the static client-only app:

**https://pritkc.github.io/Telegram-mass-account-delete/**

Architecture:

```
Your mobile browser  --MTProto/WebSocket-->  Telegram
GitHub Pages only serves HTML/CSS/JS. There is no application backend.
```

You enter your own `api_id` / `api_hash` from [my.telegram.org/apps](https://my.telegram.org/apps). Credentials, login codes, 2FA passwords, sessions, and chat data stay in the browser (or go directly to Telegram). Nothing is uploaded to this project’s servers — there are none.

### Local web build

```bash
cd web
npm ci
npm test
npm run build
# open web/dist/index.html via a local static server
npx --yes serve dist
```

### Library note

The browser client uses GramJS (`telegram@2.26.22`). That package is archived; the maintained fork `teleproto` is **Node-only** and not suitable for a client-only mobile browser app. GramJS still speaks MTProto over WebSocket in browsers, which this architecture requires.

Deletion uses `messages.DeleteHistory` with `revoke=false`, matching the Python CLI’s `delete_dialog(..., revoke=False)`: remove the dialog/history for **you only**, not for the other participant.

## Python CLI (optional)

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

- Matching is fail-closed: a dialog is targeted only when the inspected history is exactly one `MessageActionContactSignUp` service message.
- The web UI never auto-deletes after scanning; you review, select, and confirm.
- Default Python mode is dry-run. Deletion requires `--delete` and a `DELETE` confirmation unless `--yes` is supplied.

## Privacy (web)

Optional local persistence (off by default except as you opt in):

- API ID / API hash in `localStorage` if you check “Remember API ID and hash”
- Session string in `sessionStorage` by default; also in `localStorage` if you check “Keep me signed in”

Use **Log out / forget everything** to erase local data. Anyone with access to your browser profile can use stored credentials/sessions.

## API credentials

Create credentials at <https://my.telegram.org/apps>. API hashes are secrets. Passing `--api-hash` exposes the value to shell history/process inspection; prefer the interactive prompt or environment variables for shared machines.

## License

MIT
