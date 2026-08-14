const CREDS_KEY = "tg-joined-cleaner-credentials-v1";
const SESSION_PREFIX = "tg-joined-cleaner-session-v1";
const REMEMBER_SESSION_KEY = "tg-joined-cleaner-remember-session-v1";

function sessionKey(apiId) {
  return `${SESSION_PREFIX}-${apiId}`;
}

function readJson(store, key) {
  try {
    return JSON.parse(store.getItem(key) || "null");
  } catch {
    store.removeItem(key);
    return null;
  }
}

export function loadCredentials() {
  return readJson(localStorage, CREDS_KEY);
}

export function saveCredentials(apiId, apiHash, remember) {
  if (remember) {
    localStorage.setItem(CREDS_KEY, JSON.stringify({ apiId: String(apiId), apiHash }));
  } else {
    localStorage.removeItem(CREDS_KEY);
  }
}

export function shouldRememberSession() {
  return localStorage.getItem(REMEMBER_SESSION_KEY) === "1";
}

export function setRememberSession(remember) {
  if (remember) localStorage.setItem(REMEMBER_SESSION_KEY, "1");
  else localStorage.removeItem(REMEMBER_SESSION_KEY);
}

export function loadSessionString(apiId) {
  const key = sessionKey(apiId);
  if (shouldRememberSession()) {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || "";
  }
  return sessionStorage.getItem(key) || "";
}

export function saveSessionString(apiId, sessionString) {
  const key = sessionKey(apiId);
  sessionStorage.setItem(key, sessionString);
  if (shouldRememberSession()) {
    localStorage.setItem(key, sessionString);
  } else {
    localStorage.removeItem(key);
  }
}

export function clearAllLocalData() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith("tg-joined-cleaner-")) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));

  const sessionKeys = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith("tg-joined-cleaner-")) sessionKeys.push(key);
  }
  sessionKeys.forEach((key) => sessionStorage.removeItem(key));
}

export function describePersistedData() {
  const parts = [];
  if (loadCredentials()) parts.push("API ID and API hash (localStorage)");
  if (shouldRememberSession()) parts.push("Telegram session string (localStorage)");
  const hasSessionStorage = [...Array(sessionStorage.length)]
    .map((_, i) => sessionStorage.key(i))
    .some((key) => key && key.startsWith(SESSION_PREFIX));
  if (hasSessionStorage) parts.push("Telegram session string (sessionStorage for this tab)");
  return parts;
}
