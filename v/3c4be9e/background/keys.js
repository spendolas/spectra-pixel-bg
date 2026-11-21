// R / P / O reroll keys (moved from src/framework/shader.js, T3.4; same
// event.code logic and guards). onRoll(kind, { keepSeed }): kind "all" (R) |
// "palette" (P) | "preset" (O); keepSeed = the P match, checked independently
// exactly as before (a key matching both R and P rolls preset+palette but keeps
// the field seed).

import { ui } from "../framework/bus.js";

export function bindRerollKeys(onRoll) {
  window.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (ui.capture) return; // a module owns the keyboard (e.g. Video typing)
    // Match the PHYSICAL key (event.code), not the produced character: on a
    // non-English layout `event.key` for the R-position key isn't "r", so a
    // char check silently fails. Fall back to the char too, for remapped
    // layouts where the logical letter is what the user expects.
    const ch = event.key.toLowerCase();
    const code = event.code;
    const isReroll = code === "KeyR" || ch === "r";
    const isPalette = code === "KeyP" || ch === "p";
    const isPreset = code === "KeyO" || ch === "o";

    const opts = { keepSeed: isPalette };
    if (isReroll) onRoll("all", opts);
    else if (isPalette) onRoll("palette", opts);
    else if (isPreset) onRoll("preset", opts);
  });
}
