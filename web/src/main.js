import { displayTitle } from "./matching.js";
import {
  clearAllLocalData,
  describePersistedData,
  loadCredentials,
  saveCredentials,
  setRememberSession,
  shouldRememberSession,
} from "./storage.js";
import {
  createConnectedClient,
  deleteSelectedTargets,
  publicErrorMessage,
  scanForTargets,
} from "./telegramOps.js";

const $ = (id) => document.getElementById(id);

const state = {
  client: null,
  apiId: null,
  targets: [],
  scanAbort: null,
  deleteAbort: null,
  lastResult: null,
};

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]),
  );
}

function setStatus(el, message, isError = false) {
  el.textContent = message || "";
  el.className = `status${isError ? " error" : ""}`;
}

function showStep(step) {
  document.querySelectorAll("[data-step]").forEach((node) => {
    node.classList.toggle("hidden", node.getAttribute("data-step") !== step);
  });
  document.querySelectorAll(".step-dot").forEach((dot) => {
    const active = dot.getAttribute("data-step-dot") === step;
    dot.classList.toggle("active", active);
    dot.setAttribute("aria-current", active ? "step" : "false");
  });
}

function selectedTargets() {
  return state.targets.filter((t) => t.selected);
}

function updateSelectionUi() {
  const selected = selectedTargets().length;
  $("selected-count").textContent = String(selected);
  $("delete-btn").disabled = selected === 0;
  $("review-summary").textContent =
    state.targets.length === 0
      ? "No safe targets found."
      : `${state.targets.length} match${state.targets.length === 1 ? "" : "es"} · ${selected} selected`;
}

function renderReview() {
  const list = $("results");
  if (!state.targets.length) {
    list.className = "results empty";
    list.textContent = "No safe targets found in the selected scope.";
    $("selection-toolbar").classList.add("hidden");
    $("delete-bar").classList.add("hidden");
    updateSelectionUi();
    return;
  }

  $("selection-toolbar").classList.remove("hidden");
  $("delete-bar").classList.remove("hidden");
  list.className = "results";
  list.replaceChildren();

  state.targets.forEach((target, index) => {
    const row = document.createElement("label");
    row.className = "result-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = target.selected;
    checkbox.addEventListener("change", () => {
      state.targets[index].selected = checkbox.checked;
      updateSelectionUi();
    });

    const text = document.createElement("span");
    text.className = "result-text";

    const name = document.createElement("span");
    name.className = "result-name";
    name.textContent = target.title;

    const meta = document.createElement("span");
    meta.className = "result-meta";
    const bits = [`ID ${target.userId}`];
    if (target.username) bits.push(`@${target.username}`);
    if (target.deleted) bits.push("deleted account");
    meta.textContent = bits.join(" · ");

    text.append(name, meta);
    row.append(checkbox, text);
    list.append(row);
  });

  updateSelectionUi();
}

function askInModal({ title, message, inputType = "text", autocomplete = "off" }) {
  return new Promise((resolve, reject) => {
    const overlay = $("modal-overlay");
    const titleEl = $("modal-title");
    const messageEl = $("modal-message");
    const input = $("modal-input");
    const confirmBtn = $("modal-confirm");
    const cancelBtn = $("modal-cancel");
    const form = $("modal-form");

    titleEl.textContent = title;
    messageEl.textContent = message;
    input.type = inputType;
    input.autocomplete = autocomplete;
    input.value = "";
    overlay.classList.remove("hidden");
    input.focus();

    const cleanup = () => {
      form.onsubmit = null;
      cancelBtn.onclick = null;
      overlay.classList.add("hidden");
    };

    form.onsubmit = (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) {
        setStatus($("connect-status"), "A value is required to continue.", true);
        return;
      }
      cleanup();
      resolve(value);
    };

    cancelBtn.onclick = () => {
      cleanup();
      reject(new Error("Login cancelled."));
    };
  });
}

function confirmDestructive(message) {
  return window.confirm(message);
}

async function connectTelegram(event) {
  event.preventDefault();
  const button = $("connect-btn");
  button.disabled = true;
  button.textContent = "Connecting…";
  setStatus($("connect-status"), "Connecting directly from this browser to Telegram…");

  try {
    const apiIdText = $("api-id").value.trim();
    const apiHash = $("api-hash").value.trim();
    const phone = $("phone").value.trim();
    const apiId = Number(apiIdText);

    if (!Number.isInteger(apiId) || apiId <= 0) {
      throw new Error("API ID must be a positive integer.");
    }
    if (!apiHash || !phone) {
      throw new Error("API ID, API hash, and phone number are required.");
    }

    const rememberCreds = $("remember-creds").checked;
    const rememberSession = $("remember-session").checked;
    setRememberSession(rememberSession);
    saveCredentials(apiIdText, apiHash, rememberCreds);

    const client = await createConnectedClient({
      apiId,
      apiHash,
      phone,
      askCode: () =>
        askInModal({
          title: "Login code",
          message: "Enter the login code Telegram just sent you.",
          inputType: "text",
          autocomplete: "one-time-code",
        }),
      askPassword: () =>
        askInModal({
          title: "Two-step password",
          message: "This account has 2FA enabled. Enter your Telegram cloud password.",
          inputType: "password",
          autocomplete: "current-password",
        }),
      onStatus: (message) => setStatus($("connect-status"), message),
    });

    state.client = client;
    state.apiId = apiId;
    const me = await client.getMe();
    $("account-label").textContent = `Connected as ${displayTitle(me)}${me.username ? ` (@${me.username})` : ""}.`;
    setStatus($("connect-status"), "");
    showStep("scan");
  } catch (error) {
    setStatus($("connect-status"), publicErrorMessage(error), true);
  } finally {
    button.disabled = false;
    button.textContent = "Connect Telegram";
  }
}

async function runScan() {
  if (!state.client) return;
  const button = $("scan-btn");
  button.disabled = true;
  button.textContent = "Scanning…";
  $("cancel-scan-btn").classList.remove("hidden");
  state.targets = [];
  state.scanAbort = new AbortController();
  setStatus($("scan-status"), "Starting scan…");

  try {
    const scope = $("scope").value;
    const { targets, inspected } = await scanForTargets(state.client, scope, {
      signal: state.scanAbort.signal,
      onProgress: ({ inspected: count, found }) => {
        setStatus(
          $("scan-status"),
          `Scanned ${count} dialogs · found ${found} safe target${found === 1 ? "" : "s"}…`,
        );
      },
    });
    state.targets = targets;
    setStatus(
      $("scan-status"),
      `Scan complete: ${inspected} dialogs inspected · ${targets.length} safe target${targets.length === 1 ? "" : "s"} found.`,
    );
    renderReview();
    showStep("review");
  } catch (error) {
    if (error?.name === "AbortError") {
      setStatus($("scan-status"), "Scan cancelled.", true);
    } else {
      setStatus($("scan-status"), publicErrorMessage(error), true);
    }
  } finally {
    state.scanAbort = null;
    button.disabled = false;
    button.textContent = "Find joined-Telegram chats";
    $("cancel-scan-btn").classList.add("hidden");
  }
}

async function runDelete() {
  const selected = selectedTargets();
  if (!selected.length || !state.client) return;

  const ok = confirmDestructive(
    `Delete ${selected.length} selected chat${selected.length === 1 ? "" : "s"}?\n\n` +
      "This removes those dialogs from YOUR account only. It does not delete messages for the other person. This cannot be undone from this app.",
  );
  if (!ok) return;

  showStep("delete");
  $("cancel-delete-btn").classList.remove("hidden");
  state.deleteAbort = new AbortController();
  setStatus($("delete-status"), `Deleting 0 / ${selected.length}…`);

  try {
    const result = await deleteSelectedTargets(state.client, selected, {
      signal: state.deleteAbort.signal,
      onProgress: ({ index, total, succeeded, failures, waitingSeconds, currentTitle }) => {
        if (waitingSeconds) {
          setStatus(
            $("delete-status"),
            `Rate limited by Telegram. Waiting ${waitingSeconds}s before retrying “${currentTitle}”…`,
          );
        } else {
          setStatus(
            $("delete-status"),
            `Deleting ${index} / ${total} · success ${succeeded} · failed ${failures}`,
          );
        }
        $("delete-progress").value = index;
        $("delete-progress").max = total;
      },
    });

    state.lastResult = result;
    const failedBlock = $("failure-list");
    if (result.failures.length) {
      failedBlock.classList.remove("hidden");
      failedBlock.innerHTML = result.failures
        .map(
          (failure) =>
            `<li><strong>${escapeHtml(failure.title)}</strong> — ${escapeHtml(failure.error)}</li>`,
        )
        .join("");
    } else {
      failedBlock.classList.add("hidden");
      failedBlock.innerHTML = "";
    }

    $("complete-summary").textContent =
      `Deleted ${result.succeeded} of ${selected.length}.` +
      (result.failures.length ? ` ${result.failures.length} failed.` : "") +
      (result.rateLimitDelays ? ` Hit ${result.rateLimitDelays} Telegram rate-limit delay${result.rateLimitDelays === 1 ? "" : "s"}.` : "");

    // Remove successfully deleted targets from in-memory list.
    const failedIds = new Set(result.failures.map((f) => f.userId));
    state.targets = state.targets.filter((t) => !t.selected || failedIds.has(t.userId));
    showStep("complete");
  } catch (error) {
    if (error?.name === "AbortError") {
      setStatus($("delete-status"), "Deletion cancelled. Already-deleted chats stay deleted.", true);
      showStep("review");
      renderReview();
    } else {
      setStatus($("delete-status"), publicErrorMessage(error), true);
    }
  } finally {
    state.deleteAbort = null;
    $("cancel-delete-btn").classList.add("hidden");
  }
}

async function logout() {
  try {
    if (state.client) await state.client.disconnect();
  } catch {
    // ignore disconnect errors
  }
  clearAllLocalData();
  state.client = null;
  state.apiId = null;
  state.targets = [];
  state.lastResult = null;
  $("api-id").value = "";
  $("api-hash").value = "";
  $("phone").value = "";
  $("remember-creds").checked = false;
  $("remember-session").checked = false;
  setStatus($("connect-status"), "Logged out. Local credentials and session data were erased.");
  showStep("connect");
  updatePersistedHint();
}

function updatePersistedHint() {
  const parts = describePersistedData();
  $("persisted-hint").textContent = parts.length
    ? `Currently stored on this device: ${parts.join("; ")}.`
    : "Nothing sensitive is currently stored on this device.";
}

function hydrateForm() {
  const saved = loadCredentials();
  if (saved) {
    $("api-id").value = saved.apiId || "";
    $("api-hash").value = saved.apiHash || "";
    $("remember-creds").checked = true;
  }
  $("remember-session").checked = shouldRememberSession();
  updatePersistedHint();
}

$("login-form").addEventListener("submit", connectTelegram);
$("scan-btn").addEventListener("click", runScan);
$("cancel-scan-btn").addEventListener("click", () => state.scanAbort?.abort());
$("back-to-scan-btn").addEventListener("click", () => showStep("scan"));
$("select-all-btn").addEventListener("click", () => {
  state.targets.forEach((t) => {
    t.selected = true;
  });
  renderReview();
});
$("select-none-btn").addEventListener("click", () => {
  state.targets.forEach((t) => {
    t.selected = false;
  });
  renderReview();
});
$("delete-btn").addEventListener("click", runDelete);
$("cancel-delete-btn").addEventListener("click", () => state.deleteAbort?.abort());
$("scan-again-btn").addEventListener("click", () => {
  state.targets = [];
  showStep("scan");
});
$("logout-btn").addEventListener("click", logout);
$("logout-btn-complete").addEventListener("click", logout);
$("forget-btn").addEventListener("click", logout);

hydrateForm();
showStep("connect");
