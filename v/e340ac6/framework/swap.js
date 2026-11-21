// Pluggable brand-swap transitions for the Yard client wall.
//
// The rolling engine NEVER animates a logo itself — it stacks the incoming
// logo over the outgoing one in the slot and calls:
//
//     swapBrand(effect, fromEl, toEl, opts) → Promise
//
// This module owns every visual mechanic of the swap. To add or replace an
// effect, add an entry to SWAP_EFFECTS keyed by name; the engine's call site
// never changes. Each effect receives (fromEl, toEl, opts) — both logos are
// already in the DOM, toEl painted on top — and returns a Promise that
// resolves when the transition is visually complete. The engine removes
// fromEl only after the Promise settles, so an effect may read/animate it for
// its whole duration.
//
// Contract for effects (keeps damage contained):
//  - Touch ONLY fromEl / toEl (transform, opacity, filter). Never the slot,
//    siblings, or layout — slots are fixed-size and centered by CSS.
//  - Leave toEl at its resting state (opacity 1, no transform) when done, so
//    the engine can drop fromEl and the slot is immediately swap-ready again.
//  - Be reversible-safe: if the same slot is swapped again mid-flight the
//    engine cancels via AbortSignal (opts.signal) — honor it if you schedule
//    async work; WAAPI animations are cancelled by the engine for you.

import { reduceMotion } from "./anim.js";
import { IS_DEV_HOST } from "./devHost.js";

// Shared easing + timing. `duration` is the one knob callers usually override.
export const SWAP_DEFAULTS = {
  duration: 640,
  easing: "cubic-bezier(0.16, 1, 0.5, 1)", // = anim.js SNAP
};

// Resolve when all WAAPI animations finish (swallow cancels — a cancelled
// animation rejects `.finished`, which is a normal mid-flight re-swap, not an
// error the engine should see).
const settle = (anims) =>
  Promise.all(anims.map((a) => (a && a.finished ? a.finished.catch(() => {}) : null)));

// Tuned glitch defaults (dialed in scratchpad/glitch-compare.html). Plain object
// so localhost can override per-key via ?g_<key>= and a future panel can bind it.
export const GLITCH = {
  duration: 160, tear: 0, block: 0.003, posterize: 16, split: 0, blur: 0,
  slab: 56, stutter: 10, mega: 1, megaAmt: 19, shear: 0,
  scan: false, invert: false, bright: true,
  // Tuned live in /lab/. `split` = absolute-px chromatic aberration, independent
  // of tear (0 = off). `scan` is a reserved no-op. Look: light displacement +
  // mega-slabs + slab jump + shear + blur + bright-pop.
};

// Localhost-only ?g_<key>= overrides (e.g. ?g_tear=300&g_dur=400). No-op in prod.
(() => {
  if (typeof location === "undefined") return;
  if (!IS_DEV_HOST) return;
  const q = new URLSearchParams(location.search);
  const num = (k, key) => { const v = q.get(k); if (v != null && isFinite(+v)) GLITCH[key] = +v; };
  num("g_dur", "duration"); num("g_tear", "tear"); num("g_block", "block");
  num("g_post", "posterize"); num("g_split", "split"); num("g_blur", "blur");
  num("g_slab", "slab"); num("g_stutter", "stutter"); num("g_mega", "mega");
  num("g_megapx", "megaAmt"); num("g_shear", "shear");
  ["scan", "invert", "bright"].forEach((k) => { const v = q.get("g_" + k); if (v != null) GLITCH[k] = v === "1" || v === "true"; });
})();

// One reusable SVG filter (only one swap glitches at a time — the roll's busy
// gate — so a single shared filter is enough). Identity at rest: scale 0 +
// offsets 0 → the channel-split screens back to the original, so currentColor
// is untouched until driven.
const GLITCH_ID = "y-glitch";
let GF = null;
function ensureGlitchFilter() {
  if (GF) return GF;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  svg.innerHTML =
    `<defs><filter id="${GLITCH_ID}" x="-150%" y="-150%" width="400%" height="400%" color-interpolation-filters="sRGB">`
    + `<feTurbulence type="fractalNoise" baseFrequency="0.0006 0.09" numOctaves="2" seed="1" result="noise"/>`
    + `<feComponentTransfer in="noise" result="blocky"><feFuncR type="discrete" tableValues="0 0.5 1"/><feFuncG type="discrete" tableValues="0 0.5 1"/></feComponentTransfer>`
    + `<feDisplacementMap in="SourceGraphic" in2="blocky" scale="0" xChannelSelector="R" yChannelSelector="G" result="disp"/>`
    + `<feColorMatrix in="disp" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rC"/>`
    + `<feOffset in="rC" dx="0" result="rO"/>`
    + `<feColorMatrix in="disp" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gC"/>`
    + `<feColorMatrix in="disp" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bC"/>`
    + `<feOffset in="bC" dx="0" result="bO"/>`
    + `<feBlend in="rO" in2="gC" mode="screen" result="rg"/>`
    + `<feBlend in="rg" in2="bO" mode="screen" result="rgb"/>`
    + `<feGaussianBlur in="rgb" stdDeviation="0"/>`
    + `</filter></defs>`;
  document.body.appendChild(svg);
  const f = svg.querySelector(`#${GLITCH_ID}`);
  const offs = f.querySelectorAll("feOffset");
  GF = {
    turb: f.querySelector("feTurbulence"), fR: f.querySelector("feFuncR"),
    disp: f.querySelector("feDisplacementMap"), rOff: offs[0], bOff: offs[1],
    blur: f.querySelector("feGaussianBlur"),
  };
  return GF;
}

export const SWAP_EFFECTS = {
  // Straight opacity crossfade — the default, and the reference for the shape
  // of an effect. Outgoing fades out as incoming fades in.
  crossfade(fromEl, toEl, { duration, easing }) {
    const opts = { duration, easing, fill: "both" };
    const anims = [toEl.animate([{ opacity: 0 }, { opacity: 1 }], opts)];
    if (fromEl) anims.push(fromEl.animate([{ opacity: 1 }, { opacity: 0 }], opts));
    return settle(anims);
  },

  // Digital glitch: the outgoing logo tears/displaces and the incoming resolves
  // out of it. Single shared filter driven per-frame (see ensureGlitchFilter).
  // This is the DOM path only: when the yardGL WebGL wall is active, the Yard
  // roll engine (modules/yard.js rollOnce) calls yardGL's glitchSwap directly
  // and never routes through here.
  glitch(fromEl, toEl, { signal } = {}) {
    const P = GLITCH, F = ensureGlitchFilter();
    const duration = P.duration; // glitch owns its duration — swapBrand always
    //   passes SWAP_DEFAULTS.duration (640), so do NOT read duration from opts.
    const pick = (a) => a[(Math.random() * a.length) | 0];
    // per-swap filter config: band height + posterize steps
    F.turb.setAttribute("baseFrequency", "0.0006 " + P.block);
    const n = Math.max(2, P.posterize | 0);
    F.fR.setAttribute("tableValues", Array.from({ length: n }, (_, i) => (i / (n - 1)).toFixed(3)).join(" "));

    const els = [fromEl, toEl].filter(Boolean);
    els.forEach((el) => { el.style.filter = `url(#${GLITCH_ID})`; el.style.willChange = "transform, filter"; });
    toEl.style.opacity = "0";

    // Mega-slabs: N clipped band-clones of a logo's inner visual, appended INSIDE
    // the logo (its own subtree — contract-safe). Shown on peak frames.
    const slabWraps = [];
    const buildSlabs = (el) => {
      const inner = el.querySelector(".y-logo-inner");
      if (!P.mega || !inner) return;
      const wrap = document.createElement("div");
      wrap.className = "y-glitch-slabs";
      wrap.style.cssText = "position:absolute;inset:0;pointer-events:none;opacity:0";
      for (let i = 0; i < P.mega; i++) {
        const band = document.createElement("div");
        band.style.cssText = "position:absolute;inset:0";
        const top = (i / P.mega) * 100, bot = ((i + 1) / P.mega) * 100;
        band.style.clipPath = `inset(${top}% 0 ${100 - bot}% 0)`;
        band.appendChild(inner.cloneNode(true));
        wrap.appendChild(band);
      }
      el.appendChild(wrap);
      slabWraps.push(wrap);
    };
    els.forEach(buildSlabs);

    const cleanup = () => {
      F.disp.setAttribute("scale", "0"); F.rOff.setAttribute("dx", "0"); F.bOff.setAttribute("dx", "0");
      F.blur.setAttribute("stdDeviation", "0");
      els.forEach((el) => { el.style.filter = ""; el.style.transform = ""; el.style.willChange = ""; });
      if (fromEl) fromEl.style.opacity = "";
      slabWraps.forEach((w) => w.remove());
      toEl.style.opacity = "1"; toEl.style.transform = "";
    };

    return new Promise((resolve) => {
      const t0 = performance.now();
      let swapped = false, frame = 0;
      const tick = (now) => {
        if (signal && signal.aborted) { cleanup(); return resolve(); }
        try {
          const t = Math.min(1, (now - t0) / duration);
          const env = Math.sin(Math.PI * t);
          frame++;
          const gate = Math.random() < (P.stutter / 100) ? 1 : 0.12;
          const scale = Math.round((P.tear * env * gate) / 6) * 6;   // quantized block steps
          F.disp.setAttribute("scale", scale.toFixed(0));
          if (frame % 2 === 0) F.turb.setAttribute("seed", ((Math.random() * 90) | 0) + "");
          const rnd = (a, b) => a + Math.random() * (b - a);
          // RGB split: discrete jumps. Absolute px, independent of tear (so it
          // renders even when tear is 0 — the chromatic-aberration knob).
          const caMax = P.split * env;
          const ca = pick([caMax, caMax, caMax * 0.4, 0]);
          F.rOff.setAttribute("dx", (-ca).toFixed(1));
          F.bOff.setAttribute("dx", (ca).toFixed(1));
          F.blur.setAttribute("stdDeviation", (P.blur * env * gate).toFixed(2));
          // whole-logo slab jump + vertical shear, applied to both logos together
          const slab = env * pick([-1, 0, 1, 1, -1]) * rnd(P.slab * 0.4, P.slab);
          const shear = P.shear ? env * pick([-1, 1, 0]) * rnd(P.shear * 0.3, P.shear) : 0;
          const tf = `translate(${slab.toFixed(1)}px, ${(env * rnd(-1.5, 1.5)).toFixed(1)}px) skewY(${shear.toFixed(2)}deg)`;
          els.forEach((el) => { el.style.transform = tf; });
          // digital flourishes: chained CSS invert / brightness flashes
          let extra = "";
          if (P.invert && Math.random() < 0.16 * env) extra += " invert(1)";
          if (P.bright && Math.random() < 0.22 * env) extra += " brightness(1.9)";
          els.forEach((el) => { el.style.filter = `url(#${GLITCH_ID})${extra}`; });
          // mega-slabs: on peak frames, shred into offset bands
          if (P.mega > 0 && slabWraps.length) {
            const show = env > 0.4 && Math.random() < 0.85;
            slabWraps.forEach((wrap) => {
              wrap.style.opacity = show ? "1" : "0";
              if (show) for (const band of wrap.children) {
                const ox = pick([-1, 1, -1, 1, 0]) * rnd(P.megaAmt * 0.25, P.megaAmt);
                band.style.transform = `translateX(${ox.toFixed(0)}px)`;
              }
            });
          }
          if (!swapped && t >= 0.5) { swapped = true; if (fromEl) fromEl.style.opacity = "0"; toEl.style.opacity = "1"; }
          if (t < 1) requestAnimationFrame(tick);
          else { cleanup(); resolve(); }
        } catch (_) {
          cleanup(); resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  },
};

// Route a swap through the named effect. Falls back to crossfade for an unknown
// name. Reduced-motion (or a missing outgoing logo — the very first fill of an
// empty slot) resolves instantly with no animation.
export function swapBrand(effect, fromEl, toEl, opts = {}) {
  const o = { ...SWAP_DEFAULTS, ...opts };
  if (reduceMotion() || !fromEl) {
    toEl.style.opacity = "1";
    return Promise.resolve();
  }
  const fn = SWAP_EFFECTS[effect] || SWAP_EFFECTS.crossfade;
  return Promise.resolve(fn(fromEl, toEl, o));
}
