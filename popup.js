import { fixLayout, computeAltShiftBoundaries } from "./mapping.js";

const $src = document.getElementById("src");

document.getElementById("type").addEventListener("click", async () => {
  const raw = $src.value ?? "";
  if (!raw) return;
  const fixed = fixLayout(raw);
  const boundaries = computeAltShiftBoundaries(raw);
  chrome.runtime.sendMessage({ type: "CDP_TYPE_TEXT", text: fixed, altShiftPositions: boundaries, cps: 40 }, () => {});
});

document.getElementById("clear").addEventListener("click", () => {
  $src.value = "";
  $src.focus();
});
