from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from telethon.tl.types import MessageActionContactSignUp, User


@dataclass(frozen=True)
class TargetDialog:
    """A dialog proven safe enough for automatic joined-Telegram cleanup."""

    entity: User
    title: str
    user_id: int
    deleted: bool
    message_id: int
    message_count_checked: int


def display_title(user: User) -> str:
    """Return a stable human-readable label, including deleted accounts."""
    if getattr(user, "deleted", False):
        return "*deleted account"

    name = " ".join(
        part for part in [getattr(user, "first_name", None), getattr(user, "last_name", None)] if part
    ).strip()
    if name:
        return name

    username = getattr(user, "username", None)
    if username:
        return f"@{username}"

    user_id = getattr(user, "id", None)
    return f"user {user_id}" if user_id is not None else "*unknown account"


def is_joined_service_message(message) -> bool:
    """Identify Telegram's structural contact-signup service message."""
    return isinstance(getattr(message, "action", None), MessageActionContactSignUp)


def classify_dialog(dialog, recent_messages: Iterable) -> TargetDialog | None:
    """Classify one private dialog.

    Safe rule: the newest history inspected must consist solely of the exact
    ContactSignUp action, and there must be only one message. This avoids
    deleting a legitimate conversation that merely contains a signup event.
    The caller intentionally fetches two messages so a second normal message
    is enough to reject the dialog without scanning large histories.
    """
    user = dialog.entity
    if not getattr(dialog, "is_user", False) or not isinstance(user, User):
        return None

    messages = list(recent_messages)
    if len(messages) != 1:
        return None

    message = messages[0]
    if not is_joined_service_message(message):
        return None

    return TargetDialog(
        entity=user,
        title=display_title(user),
        user_id=user.id,
        deleted=bool(getattr(user, "deleted", False)),
        message_id=message.id,
        message_count_checked=len(messages),
    )
