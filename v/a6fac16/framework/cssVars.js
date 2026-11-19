// Ships. Single source that pushes TIMINGS duration values onto :root CSS
// custom properties, so index.html's CSS transitions/animations run off the
// config instead of hardcoded literals. main.js calls syncAllCssVars() at boot;
// the dev timeline panel calls syncCssVar(k) on each edit for live retiming.
// Production never runs the panel, so :root simply reflects the coded defaults.
import { TIMINGS } from "./timings.js";

// TIMINGS key → CSS custom property. ONLY keys listed here are treated as
// CSS-backed; syncCssVar is a safe no-op for anything else.
export const CSS_VARS = {
  moduleDur: "--module-dur",
  revealMs: "--reveal-dur",
  idleFadeMs: "--dur-idle-fade",
  teaserFadeMs: "--dur-teaser-fade",
  enterFadeMs: "--dur-enter-fade",
  progressFillMs: "--dur-progress",
  muteFadeMs: "--dur-mute-fade",
  muteVisualMs: "--dur-mute-visual",
  shakeMs: "--dur-shake",
  kbSlideMs: "--dur-kb-slide",
  caretBlinkMs: "--dur-caret-blink",
  cursorWeightMs: "--dur-cursor-weight",
};

const root = () =>
  typeof document !== "undefined" ? document.documentElement : null;

export function syncCssVar(key) {
  const varName = CSS_VARS[key];
  const el = root();
  if (!varName || !el || TIMINGS[key] == null) return;
  el.style.setProperty(varName, TIMINGS[key] + "ms");
}

export function syncAllCssVars() {
  Object.keys(CSS_VARS).forEach(syncCssVar);
}
