/**
 * Fail-closed matching for Telegram "X joined Telegram" service dialogs.
 * Mirrors tg_joined_cleaner/scanner.py: a private user dialog is a target only
 * when the inspected recent history is exactly one MessageActionContactSignUp.
 */

export function displayTitle(user) {
  if (user?.deleted) return "*deleted account";

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;

  if (user?.username) return `@${user.username}`;

  const id = user?.id;
  if (id == null) return "*unknown account";
  return `user ${String(id)}`;
}

export function isJoinedServiceMessage(message) {
  return message?.action?.className === "MessageActionContactSignUp";
}

export function classifyDialog(dialog, recentMessages) {
  const user = dialog?.entity;
  if (!dialog?.isUser || !user || user.className !== "User") {
    return null;
  }

  const messages = Array.from(recentMessages || []);
  if (messages.length !== 1) return null;

  const message = messages[0];
  if (!isJoinedServiceMessage(message)) return null;

  return {
    entity: user,
    title: displayTitle(user),
    userId: String(user.id),
    username: user.username || null,
    deleted: Boolean(user.deleted),
    messageId: message.id,
    messageCountChecked: messages.length,
  };
}
