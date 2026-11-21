// Boot: start the persistent shader, build the deck from the registry, and
// start once the variable font is ready (so Hero's line-split measures against
// the loaded font). See DESIGN.md §11.

import { initShader } from "./background/index.js";
import { createDeck } from "./framework/deck.js";
import { registry } from "./registry.js";
import { TIMINGS } from "./framework/timings.js";
import { syncAllCssVars } from "./framework/cssVars.js";
import { IS_DEV_HOST, isDevEnabled } from "./framework/devHost.js";

document.addEventListener("DOMContentLoaded", () => {
  // Push coded TIMINGS durations onto :root CSS vars before first paint, so
  // CSS transitions/animations run off the config (no hardcoded literals).
  syncAllCssVars();
  // Boot isolation: initShader never throws — if spectraGL is unavailable (no
  // Three.js / WebGL) it falls back to the css engine, else to an engine-less
  // director whose calls are no-ops, so the deck always boots (T3.6).
  const shader = initShader("#bg");
  const root = document.getElementById("deck");
  const deck = createDeck({ registry, shader, root });

  if (IS_DEV_HOST) window.__deck = deck;

  // Dev-only timeline EDIT MODE — loads ONLY at :8765/edit/ (the dev server
  // routes that path to this same app), and only on localhost. The regular link
  // stays completely clean: nothing dev-related is imported or rendered. Never
  // ships either — the module is excluded from the release build (release.sh)
  // and this import can't fire in production. Bonus: the video gate reads the
  // URL #fragment as its access code, so /edit/#<code> opens straight into an
  // unlocked Video for tuning.
  const isLocal = isDevEnabled();
  const editMode = isLocal && /^\/edit(\/|$)/.test(location.pathname);
  if (editMode) {
    import("./dev/timelinePanel.js")
      .then((m) => m.initTimelinePanel && m.initTimelinePanel(deck))
      .catch((e) => console.warn("[dev]", e));
  }

  // Yard LAB (localhost): :8765/lab/ or ?lab — boot straight into Yard with the
  // glitch tuning panel. Dev-only; glitchLab.js is stripped from the release build.
  const labMode =
    isLocal && (/^\/lab(\/|$)/.test(location.pathname) || new URLSearchParams(location.search).has("lab"));
  if (labMode) {
    import("./dev/glitchLab.js")
      .then((m) => m.initGlitchLab && m.initGlitchLab(deck))
      .catch((e) => console.warn("[dev]", e));
    import("./dev/blackholeLab.js")
      .then((m) => m.initBlackholeLab && m.initBlackholeLab())
      .catch((e) => console.warn("[dev]", e));
  }

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    if (labMode) {
      const yardIdx = registry.findIndex((m) => m && m.id === "yard");
      deck.start(yardIdx >= 0 ? yardIdx : 0);
    } else {
      deck.start(0);
    }
  };

  if (document.fonts && document.fonts.load) {
    Promise.resolve(document.fonts.load('400 1em "Space Grotesk"'))
      .then(() => document.fonts.ready)
      .then(start)
      .catch(start);
    window.setTimeout(start, TIMINGS.fontFallbackMs); // safety: never hang if the CDN is blocked
  } else {
    window.addEventListener("load", start);
    window.setTimeout(start, TIMINGS.fontFallbackMs);
  }
});
