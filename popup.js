import { fixLayout, computeAltShiftBoundaries } from "./mapping.js";

const $src = document.getElementById("src");
const $cps = document.getElementById("cps");

const CPS_KEY = "cps";

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

document.getElementById("type").addEventListener("click", async () => {
  const raw = $src.value ?? "";
  if (!raw) return;
  const fixed = fixLayout(raw);
  const boundaries = computeAltShiftBoundaries(raw);
  chrome.runtime.sendMessage({ type: "CDP_TYPE_TEXT", text: fixed, altShiftPositions: boundaries, cps: readCps() }, () => {});
});

document.getElementById("altshift").addEventListener("click", async () => {
  chrome.runtime.sendMessage({ type: "CDP_ALT_SHIFT" }, () => {});
});

document.getElementById("stop").addEventListener("click", async () => {
  chrome.runtime.sendMessage({ type: "CDP_STOP" }, () => {});
});

document.getElementById("clear").addEventListener("click", () => {
  $src.value = "";
  $src.focus();
});
