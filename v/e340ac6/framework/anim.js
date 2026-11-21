// Shared motion: easing, timing tokens, and the module enter/exit transition
// layers (WAAPI). See DESIGN.md §5 + §11.

import { ui } from "./bus.js";
import { TIMINGS } from "./timings.js";

export const SNAP = "cubic-bezier(0.16, 1, 0.5, 1)";

// Anchors the deck marked as persistent (identical in both modules) don't
// exit/enter — the deck color-tweens them across the transition instead.
const notPersistent = (els, persist) =>
  persist ? els.filter((el) => el && !persist.has(el)) : els;

// Transition context for the public helpers: opts.leads / opts.persist (the
// deck's ctx, passed through by Hero/Yard) win; when absent, fall back to the
// deck's ui.trans / ui.persist (Video calls without them).
const leadsOf = (opts) => (opts && opts.leads) || ui.trans || {};
const persistOf = (opts) => (opts && opts.persist !== undefined ? opts.persist : ui.persist);

// Timing tokens. The ms values live in TIMINGS (framework/timings.js) so the
// timeline panel can retune them live; T exposes them as GETTERS, so every
// existing `T.moduleDur` read stays live without touching call-sites. rise/blur
// are px (not time), so they stay literal here.
export const T = {
  get moduleDur() { return TIMINGS.moduleDur; }, // base cross-module transition
  get primaryDur() { return TIMINGS.primaryDur; }, // main text (title / prompt)
  get anchorDur() { return TIMINGS.anchorDur; }, // corner anchors — quicker
  get stagger() { return TIMINGS.stagger; }, // between staggered elements
  rise: 80, // vertical shift distance (px)
  blur: 12, // entrance blur (px)
};

export const reduceMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

const finished = (anim) => (anim && anim.finished ? anim.finished : Promise.resolve());

// WAAPI `.finished` never settles for a non-rendered (display:none) element,
// so skip animating those — apply the end state inline and return null.
const isRendered = (el) => el.getClientRects().length > 0;

// Animate a set IN: fade + optional rise + de-blur, staggered in array order.
// direction "down" → rise from below; "up" → drop from above.
const animateInSet = (els, { dir, dur, stagger, startDelay = 0, rise = true, reorder = false }) => {
  const reduce = reduceMotion();
  const sign = dir === "up" ? -1 : 1;
  const list = els.filter(Boolean);
  const n = list.length;
  return list.map((el, i) => {
    // Directional line order: top→bottom on "down" (the default, incl. first
    // load), reversed to bottom→top on "up" so the stagger follows the scroll
    // direction. Only opted-in sets (the text lines) reorder; anchors keep order.
    const order = reorder && dir === "up" ? n - 1 - i : i;
    const delay = startDelay + order * (reduce ? 0 : stagger);
    const from =
      reduce || !rise
        ? { opacity: 0, filter: reduce ? "blur(0)" : `blur(${T.blur}px)` }
        : {
            opacity: 0,
            transform: `translateY(${sign * T.rise}px)`,
            filter: `blur(${T.blur}px)`,
          };
    const to =
      reduce || !rise
        ? { opacity: 1, filter: "blur(0)" }
        : { opacity: 1, transform: "translateY(0)", filter: "blur(0)" };
    if (!isRendered(el)) {
      Object.assign(el.style, to);
      return null;
    }
    return el.animate([from, to], {
      duration: reduce ? TIMINGS.reduceMotionDur : dur,
      delay,
      easing: SNAP,
      fill: "both",
    });
  });
};

// Animate a set OUT: fade + optional shift away, staggered.
const animateOutSet = (els, { dir, dur, stagger, startDelay = 0, rise = true }) => {
  const reduce = reduceMotion();
  const sign = dir === "up" ? 1 : -1; // leaves opposite to how the next enters
  return els.filter(Boolean).map((el, i) => {
    const delay = startDelay + i * (reduce ? 0 : stagger);
    const to =
      reduce || !rise
        ? { opacity: 0, filter: reduce ? "blur(0)" : `blur(${T.blur}px)` }
        : {
            opacity: 0,
            transform: `translateY(${sign * T.rise}px)`,
            filter: `blur(${T.blur}px)`,
          };
    if (!isRendered(el)) {
      Object.assign(el.style, to);
      return null;
    }
    return el.animate(
      [{ opacity: 1, transform: "translateY(0)", filter: "blur(0)" }, to],
      { duration: reduce ? TIMINGS.reduceMotionDur : dur, delay, easing: SNAP, fill: "both" }
    );
  });
};

// Public: enter a module. primary = main text (rises, staggered first);
// anchors = corner texts in clockwise order (fade-only, staggered after).
// opts.lead delays the whole entrance (used for Hero's first-load settle);
// opts.leads / opts.persist = the deck's ctx (fallback ui.trans / ui.persist).
export const enterModule = (primary = [], anchors = [], dir = "down", opts = {}) => {
  // Per-transition start-offsets (ctx leads, else ui.trans); opts.lead is Hero's
  // first-load settle on top. Defaults 0.
  const tr = leadsOf(opts);
  const lead = (opts.lead || 0) + (tr.textIn || 0);
  const a = animateInSet(primary, { dir, dur: T.primaryDur, stagger: T.stagger, startDelay: lead, rise: true, reorder: true });
  const aEnd = lead + Math.max(0, primary.filter(Boolean).length - 1) * T.stagger + (tr.anchorIn || 0);
  const b = animateInSet(notPersistent(anchors, persistOf(opts)), { dir, dur: T.anchorDur, stagger: T.stagger, startDelay: aEnd, rise: false });
  return Promise.all([...a, ...b].map(finished));
};

// Public: exit a module — everything fades/shifts out quickly together, with NO
// stagger (lines/anchors leave simultaneously) for a simpler, snappier exit.
// opts.leads / opts.persist = the deck's ctx (fallback ui.trans / ui.persist).
export const exitModule = (primary = [], anchors = [], dir = "down", opts = {}) => {
  const lead = leadsOf(opts).textOut || 0; // per-transition exit offset
  const a = animateOutSet(primary, { dir, dur: T.anchorDur, stagger: 0, startDelay: lead, rise: true });
  const b = animateOutSet(notPersistent(anchors, persistOf(opts)), { dir, dur: T.anchorDur, stagger: 0, startDelay: lead, rise: false });
  return Promise.all([...a, ...b].map(finished));
};

// Idle-aware content exit (Hero/Video). The wheel that triggers a module exit
// also fires the idle-dimmer's wake() (strips `.content.idle`), which starts a
// CSS transition brightening the content 5% → 100% — so exiting FROM the idle
// state reads as a jump-to-opaque before the exit fade. Override it: fade the
// content container from its CURRENT (dimmed / mid-un-dim) opacity straight to 0,
// in sync with the exit (same dur/easing/lead), so the exit continues smoothly
// from whatever state it was in. No-op at (near) full opacity, so a normal,
// non-idle exit is left exactly as before. Pair with resetContentOpacity() on
// enter so the fill:both fade doesn't leave the container invisible on re-entry.
// opts.leads = the deck's ctx leads (fallback ui.trans).
export const fadeContentOut = (content, opts = {}) => {
  if (!content) return null;
  const cur = parseFloat(getComputedStyle(content).opacity);
  if (!(cur < 0.999)) return null; // full opacity → leave the normal exit alone
  const lead = leadsOf(opts).textOut || 0;
  return content.animate(
    [{ opacity: cur }, { opacity: 0 }],
    { duration: reduceMotion() ? TIMINGS.reduceMotionDur : T.anchorDur, delay: lead, easing: SNAP, fill: "both" }
  );
};

// Clear a leftover fadeContentOut() fill so the module re-enters at full opacity.
export const resetContentOpacity = (content) => {
  if (!content) return;
  content.getAnimations().forEach((a) => a.cancel());
  content.style.opacity = "";
};
export { makeBezier } from "./bezier.js";
