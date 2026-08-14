import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

const SESSION_PREFIX = "tg-joined-cleaner-session-v1";
const CREDS_KEY = "tg-joined-cleaner-credentials-v1";
const $ = (id) => document.getElementById(id);

const state = { client: null, apiId: null, targets: [] };

function sessionKey(apiId) { return `${SESSION_PREFIX}-${apiId}`; }
function setStatus(message, error = false) {
  const el = $("status");
  el.textContent = message || "";
  el.className = `status${error ? " error" : ""}`;
}
function setBusy(button, busy, busyLabel, idleLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
}
function errorMessage(error) { return error?.errorMessage || error?.message || String(error); }
function titleFor(user) {
  if (user?.deleted) return "Deleted account";
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return name || (user?.username ? `@${user.username}` : `User ${user?.id ?? "unknown"}`);
}
function isTarget(message) { return message?.action?.className === "MessageActionContactSignUp"; }
function escapeHtml(value) {
  return value.replace(/[&<>\'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
}

function loadCredentials() {
  try {
    const saved = JSON.parse(localStorage.getItem(CREDS_KEY) || "null");
    if (!saved) return;
    $("api-id").value = saved.apiId || "";
    $("api-hash").value = saved.apiHash || "";
    $("remember-creds").checked = true;
  } catch {
    localStorage.removeItem(CREDS_KEY);
  }
}

function saveCredentials(apiId, apiHash) {
  if ($("remember-creds").checked) localStorage.setItem(CREDS_KEY, JSON.stringify({ apiId, apiHash }));
  else localStorage.removeItem(CREDS_KEY);
}

function renderTargets() {
  const results = $("results");
  if (!state.targets.length) {
    results.className = "results empty";
    results.textContent = "No safe targets found in the selected scope.";
    $("delete-bar").classList.add("hidden");
    return;
  }
  results.className = "results";
  results.innerHTML = state.targets.map((target) => `
    <div class="result-row">
      <span>
        <span class="result-name">${escapeHtml(target.title)}</span>
        <span class="result-meta">User ID ${escapeHtml(String(target.userId))}</span>
      </span>
    </div>
  `).join("");
  $("delete-bar").classList.add("hidden");
}

async function scanTelegram() {
  if (!state.client) return;
  const button = $("scan-btn");
  setBusy(button, true, "Scanning…", "Scan Telegram");
  state.targets = [];
  renderTargets();
  try {
    const scope = $("scope").value;
    const params = scope === "all" ? {} : { folder: scope === "main" ? 0 : 1 };
    let inspected = 0;
    for await (const dialog of state.client.iterDialogs(params)) {
      inspected += 1;
      if (!dialog.isUser || !dialog.entity || dialog.entity.className !== "User") continue;
      const recent = await state.client.getMessages(dialog.entity, { limit: 2 });
      if (recent.length !== 1 || !isTarget(recent[0])) continue;
      state.targets.push({ title: titleFor(dialog.entity), userId: dialog.entity.id });
      setStatus(`Scanned ${inspected} dialogs · found ${state.targets.length} safe target${state.targets.length === 1 ? "" : "s"}…`);
      renderTargets();
    }
    setStatus(`Scan complete: ${inspected} dialogs inspected · ${state.targets.length} safe target${state.targets.length === 1 ? "" : "s"} found.`);
    renderTargets();
  } catch (error) {
    console.error(error);
    setStatus(errorMessage(error), true);
  } finally {
    setBusy(button, false, "Scanning…", "Scan Telegram");
  }
}

async function promptValue(message) {
  const value = window.prompt(message);
  if (value === null || !value.trim()) throw new Error("Login cancelled or empty value.");
  return value.trim();
}

async function connectTelegram(event) {
  event.preventDefault();
  const button = $("connect-btn");
  setBusy(button, true, "Connecting…", "Connect Telegram");
  setStatus("Connecting directly from this browser to Telegram…");
  try {
    const apiIdText = $("api-id").value.trim();
    const apiHash = $("api-hash").value.trim();
    const phone = $("phone").value.trim();
    const apiId = Number(apiIdText);
    if (!Number.isInteger(apiId) || apiId <= 0) throw new Error("API ID must be a positive integer.");
    if (!apiHash || !phone) throw new Error("API ID, API hash, and phone number are required.");
    saveCredentials(apiIdText, apiHash);

    const session = new StringSession(localStorage.getItem(sessionKey(apiId)) || "");
    const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
    await client.start({
      phoneNumber: async () => phone,
      phoneCode: async () => promptValue("Enter the Telegram login code:"),
      password: async () => promptValue("Enter your Telegram 2FA password:"),
      onError: (error) => console.error("Telegram authentication error", error),
    });

    localStorage.setItem(sessionKey(apiId), client.session.save());
    state.client = client;
    state.apiId = apiId;
    const me = await client.getMe();
    $("account-label").textContent = `Connected as ${titleFor(me)}${me.username ? ` (@${me.username})` : ""}.`;
    $("setup-card").classList.add("hidden");
    $("app-card").classList.remove("hidden");
    setStatus("Connected. Run a scan to see matching service dialogs.");
  } catch (error) {
    console.error(error);
    setStatus(errorMessage(error), true);
  } finally {
    setBusy(button, false, "Connecting…", "Connect Telegram");
  }
}

async function logout() {
  try { if (state.client) await state.client.disconnect(); } catch (error) { console.error(error); }
  if (state.apiId) localStorage.removeItem(sessionKey(state.apiId));
  state.client = null;
  state.targets = [];
  $("app-card").classList.add("hidden");
  $("setup-card").classList.remove("hidden");
  setStatus("");
  renderTargets();
}

$("login-form").addEventListener("submit", connectTelegram);
$("scan-btn").addEventListener("click", scanTelegram);
$("logout-btn").addEventListener("click", logout);
loadCredentials();
