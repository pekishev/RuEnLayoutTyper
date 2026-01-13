import { fixLayout, computeAltShiftBoundaries } from "./mapping.js";

const $src = document.getElementById("src");
const $cps = document.getElementById("cps");
const $stop = document.getElementById("stop");
const $resume = document.getElementById("resume");
const $altShift = document.getElementById("altshift");
const $type = document.getElementById("type");
const $clear = document.getElementById("clear");

const CPS_KEY = "cps";
let pollTimer = null;
let uiEpoch = 0;
let lastUiState = "idle";

function sendMessageSafe(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (resp) => {
      // Avoid: "Unchecked runtime.lastError: The message port closed before a response was received."
      const err = chrome.runtime.lastError;
      if (err) return resolve({ ok: false, error: err.message });
      resolve(resp);
    });
  });
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function readCps() {
  const raw = Number($cps?.value);
  if (!Number.isFinite(raw)) return 40;
  return clamp(Math.round(raw), 1, 200);
}

// restore saved cps
try {
  const saved = Number(localStorage.getItem(CPS_KEY));
  if (Number.isFinite(saved) && $cps) $cps.value = String(clamp(Math.round(saved), 1, 200));
} catch {}

// persist cps
$cps?.addEventListener("change", () => {
  const v = readCps();
  $cps.value = String(v);
  try { localStorage.setItem(CPS_KEY, String(v)); } catch {}
});

function setUiState(state) {
  // idle: stop/resume hidden
  // running: stop visible, resume hidden
  // paused: stop+resume visible
  lastUiState = state;
  const showStop = state === "running" || state === "paused";
  const showResume = state === "paused";
  $stop?.classList.toggle("hidden", !showStop);
  $resume?.classList.toggle("hidden", !showResume);
  $type?.classList.toggle("hidden", state !== "idle");
  $clear?.classList.toggle("hidden", state !== "idle");
  // Alt+Shift during running can interfere with an active CDP session; hide it then.
  $altShift?.classList.toggle("hidden", state === "running");
}

async function refreshStatus() {
  const epochAtStart = uiEpoch;
  const resp = await sendMessageSafe({ type: "CDP_STATUS" });
  // If user triggered an action (type/stop/resume) while this request was in-flight,
  // don't let a stale status response override the optimistic UI.
  if (epochAtStart !== uiEpoch) return null;
  const state = resp?.state;
  // If status call failed, don't "snap" UI back to idle.
  if (state !== "idle" && state !== "running" && state !== "paused") return null;
  setUiState(state);
  return state;
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => { refreshStatus(); }, 400);
}

function stopPolling() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

// initial sync
refreshStatus().then((state) => {
  if (state === "idle") stopPolling();
  else startPolling();
});

document.getElementById("type").addEventListener("click", async () => {
  const raw = $src.value ?? "";
  if (!raw) return;
  const fixed = fixLayout(raw);
  const boundaries = computeAltShiftBoundaries(raw);
  uiEpoch++;
  setUiState("running");
  startPolling();
  await sendMessageSafe({ type: "CDP_TYPE_TEXT", text: fixed, altShiftPositions: boundaries, cps: readCps() });
  const state = await refreshStatus();
  if (state === "idle") stopPolling();
});

document.getElementById("altshift").addEventListener("click", async () => {
  await sendMessageSafe({ type: "CDP_ALT_SHIFT" });
});

document.getElementById("stop").addEventListener("click", async () => {
  uiEpoch++;
  // optimistic UI:
  // - running -> paused
  // - paused -> idle (second stop clears job)
  if (lastUiState === "paused") setUiState("idle");
  else setUiState("paused");
  await sendMessageSafe({ type: "CDP_STOP" });
  const state = await refreshStatus();
  if (state === "idle") stopPolling();
  else startPolling();
});

document.getElementById("resume").addEventListener("click", async () => {
  uiEpoch++;
  setUiState("running");
  startPolling();
  await sendMessageSafe({ type: "CDP_RESUME" });
  const state = await refreshStatus();
  if (state === "idle") stopPolling();
});

document.getElementById("clear").addEventListener("click", () => {
  $src.value = "";
  $src.focus();
});
