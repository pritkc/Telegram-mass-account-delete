import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { FloodWaitError } from "telegram/errors";
import { classifyDialog } from "./matching.js";
import { loadSessionString, saveSessionString } from "./storage.js";

const DELETE_GAP_MS = 400;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function publicErrorMessage(error) {
  if (error instanceof FloodWaitError) {
    return `Telegram rate limit: wait ${error.seconds}s and try again.`;
  }
  return error?.errorMessage || error?.message || "Something went wrong talking to Telegram.";
}

export { publicErrorMessage };

export async function createConnectedClient({ apiId, apiHash, phone, askCode, askPassword, onStatus }) {
  const session = new StringSession(loadSessionString(apiId));
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: true,
    floodSleepThreshold: 90,
  });

  onStatus?.("Connecting directly from this browser to Telegram…");

  await client.start({
    phoneNumber: async () => phone,
    phoneCode: async () => askCode(),
    password: async () => askPassword(),
    onError: () => {
      // Intentionally do not log; auth errors may include sensitive context.
    },
  });

  saveSessionString(apiId, client.session.save());
  return client;
}

export async function scanForTargets(client, scope, { onProgress, signal } = {}) {
  const params = scope === "all" ? {} : { folder: scope === "main" ? 0 : 1 };
  const targets = [];
  let inspected = 0;

  for await (const dialog of client.iterDialogs(params)) {
    if (signal?.aborted) throw new DOMException("Scan cancelled", "AbortError");
    inspected += 1;

    const recent = await client.getMessages(dialog.entity, { limit: 2 });
    const target = classifyDialog(dialog, recent);
    if (target) {
      targets.push({ ...target, selected: true });
    }

    onProgress?.({ inspected, found: targets.length });
  }

  return { targets, inspected };
}

/**
 * Deletes a private dialog for the current user only.
 * Matches Telethon client.delete_dialog(entity, revoke=False):
 * messages.DeleteHistory with maxId=0 and revoke=false.
 * Does not delete history for the other participant.
 */
export async function deleteTargetDialog(client, target) {
  await client.invoke(
    new Api.messages.DeleteHistory({
      peer: target.entity,
      maxId: 0,
      revoke: false,
    }),
  );
}

export async function deleteSelectedTargets(client, targets, { onProgress, signal } = {}) {
  let succeeded = 0;
  const failures = [];
  let rateLimitDelays = 0;

  for (let i = 0; i < targets.length; i += 1) {
    if (signal?.aborted) throw new DOMException("Deletion cancelled", "AbortError");
    const target = targets[i];
    try {
      await deleteTargetDialog(client, target);
      succeeded += 1;
    } catch (error) {
      if (error instanceof FloodWaitError) {
        rateLimitDelays += 1;
        onProgress?.({
          index: i + 1,
          total: targets.length,
          succeeded,
          failures: failures.length,
          waitingSeconds: error.seconds,
          currentTitle: target.title,
        });
        await sleep(error.seconds * 1000);
        try {
          await deleteTargetDialog(client, target);
          succeeded += 1;
        } catch (retryError) {
          failures.push({ title: target.title, userId: target.userId, error: publicErrorMessage(retryError) });
        }
      } else {
        failures.push({ title: target.title, userId: target.userId, error: publicErrorMessage(error) });
      }
    }

    onProgress?.({
      index: i + 1,
      total: targets.length,
      succeeded,
      failures: failures.length,
      waitingSeconds: 0,
      currentTitle: target.title,
    });

    if (i < targets.length - 1) await sleep(DELETE_GAP_MS);
  }

  return { succeeded, failures, rateLimitDelays };
}
