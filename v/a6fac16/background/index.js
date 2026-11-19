// Persistent background: boots the spectraGL engine, the director that owns its
// state/tweens/tokens, and the R/P/O keys. initShader() returns the director
// (the controller the deck/modules use). See DESIGN.md §3 + §11.
// Moved from src/framework/shader.js (T3.4); boot order unchanged.

import { IS_DEV_HOST, isDevEnabled } from "../framework/devHost.js";
import { safePresets, safePalettes, pickRandom, buildOptions, requestedEngine, requestedScene, useSombraMock, requestedRegistry } from "./config.js";
import { SPECTRA_CAPS, createSpectraEngine, fadeInCanvas } from "./engines/spectra.js";
import { createCssEngine } from "./engines/css.js";
import { createMockEngine } from "./engines/mock.js";
import { createDirector, writeTokens } from "./director.js";
import { bindRerollKeys } from "./keys.js";

// CSS fallback engine, or null if even that cannot be built (then the director
// runs engine-less: every call is a no-op and the site still boots).
const tryCss = (target, colors) => {
  try {
    return createCssEngine(target, colors);
  } catch (e) {
    console.warn("[background] css engine failed; continuing without a background", e);
    return null;
  }
};

// ── Sombra (dev-only, T4.7) ─────────────────────────────────────────────────────
// engines/sombra.js (+ profile.js) is loaded with a dynamic import ONLY on the
// ?engine=sombra path, so the default boot never fetches it. A small synchronous
// proxy stands in until it arrives (the director needs an engine at boot); it
// forwards the latest call per setter and the subscriptions once the real engine
// exists. Provisional caps = engines/sombra.js SOMBRA_CAPS (a 4-stop parity scene).
const SOMBRA_PROVISIONAL_CAPS = Object.freeze({
  stops: 4, slots: 4, perStopAlpha: true, fieldAlpha: true, balance: true, seed: true, freeze: true, gpu: true, clock: "wall",
});
const REGISTRY_URL = new URL("../assets/shaders/index.json", import.meta.url).href;

// Scene choice: ?scene=<id> when listed, else a weighted pick from the registry.
async function pickScene(initialOpts) {
  const override = requestedRegistry(); // dev-only test registry under dev/fixtures/
  const res = await fetch(override ? new URL(`../${override}`, import.meta.url).href : REGISTRY_URL);
  if (!res.ok) throw new Error(`scene registry HTTP ${res.status}`);
  const reg = await res.json();
  const list = (reg && Array.isArray(reg.scenes) ? reg.scenes : []).filter((s) => s && typeof s.id === "string");
  if (!list.length) throw new Error("scene registry is empty");
  const ids = list.map((s) => s.id);
  const presetMap = reg.presetMap && Array.isArray(reg.presetMap.rules) ? reg.presetMap : null;
  const want = requestedScene();
  if (want) {
    if (ids.includes(want)) return { id: want, ids, presetMap };
    console.warn(`[background] ?scene=${want} is not in the registry; picking from it`);
  }
  if (presetMap) {
    const { resolveSceneId } = await import("./engines/sombra.js");
    const id = resolveSceneId(presetMap, initialOpts);
    if (id && ids.includes(id)) return { id, ids, presetMap };
  }
  const total = list.reduce((a, s) => a + (s.weight > 0 ? s.weight : 0), 0);
  let r = Math.random() * (total || list.length);
  const pick = total ? list.find((s) => (r -= s.weight > 0 ? s.weight : 0) < 0) || list[0] : list[Math.floor(r)];
  return { id: pick.id, ids, presetMap: null };
}

function createSombraProxy(target, colors, seed, initialOpts) {
  let real = null;
  let dead = false;
  const pending = new Map(); // method → args (latest call wins; insertion order kept)
  const subs = [];
  const fwd = (m) => (...a) => {
    if (real) return real[m](...a);
    pending.delete(m);
    pending.set(m, a);
  };
  const ready = (async () => {
    const [{ createSombraEngine }, scene] = await Promise.all([import("./engines/sombra.js"), pickScene(initialOpts)]);
    if (dead) return false;
    const e = createSombraEngine({ target, sceneId: scene.id, scenes: scene.ids, presetMap: scene.presetMap, colors, seed, mock: useSombraMock() });
    real = e;
    proxy.scenes = e.scenes;
    for (const [m, a] of pending) e[m](...a);
    pending.clear();
    for (const [t, f] of subs) e.on(t, f);
    const ok = await e.ready;
    if (ok) proxy.resolvedCaps = e.resolvedCaps;
    return ok;
  })().catch((err) => {
    console.warn("[background] sombra unavailable:", err && err.message ? err.message : err);
    return false;
  });
  const proxy = {
    id: "sombra",
    caps: SOMBRA_PROVISIONAL_CAPS,
    resolvedCaps: null,
    scenes: [],
    ready,
    get el() {
      return real ? real.el : null;
    },
    writable: true,
    setScene: fwd("setScene"),
    setPalette: fwd("setPalette"),
    setStopAlpha: fwd("setStopAlpha"),
    setBalance: fwd("setBalance"),
    setOptions() {},
    setPlaying: fwd("setPlaying"),
    on(type, fn) {
      if (real) return real.on(type, fn);
      const entry = [type, fn];
      subs.push(entry);
      return () => {
        const i = subs.indexOf(entry);
        if (i >= 0) subs.splice(i, 1);
      };
    },
    destroy() {
      dead = true;
      if (real) real.destroy();
    },
    get handle() {
      return real ? real.handle : null; // dev / harness only
    },
  };
  return proxy;
}

// Boot the background and return the director the deck/modules use. Never
// throws. Fallback chain (T3.6): requested engine (dev-only ?engine=, default
// spectra) → spectra → css → none. A spectra engine whose `ready` resolves false
// (unsupported / no WebGL / no canvas) is swapped for css afterwards and destroyed.
// A Sombra engine (dev-only) that fails falls back to spectra first, then css (T4.7).
// The healthy default path is exactly the pre-T3.6 boot.
export function initShader(target = "#bg") {
  const chosenPreset = pickRandom(safePresets);
  const chosenPalette = pickRandom(safePalettes);

  const initialOpts = buildOptions(chosenPreset, chosenPalette);
  writeTokens(initialOpts.colors);

  const want = requestedEngine();
  let effect = null;
  if (want !== "css" && want !== "mock" && want !== "sombra") {
    try {
      const factory = typeof window.spectraGL === "function" ? window.spectraGL : null;
      effect = factory ? factory({ target, ...initialOpts }) : null;
    } catch (e) {
      console.warn("[background] spectraGL failed; falling back to css", e);
      effect = null;
    }
  }
  let caps = { ...SPECTRA_CAPS };
  let engine = effect ? createSpectraEngine(effect, caps) : null;
  if (!engine && want === "sombra") {
    // Dev-only Sombra scene (T4.5/T4.7); loads asynchronously behind a proxy.
    try {
      engine = createSombraProxy(target, initialOpts.colors, initialOpts.field.seed, initialOpts);
      caps = { ...engine.caps };
    } catch (e) {
      console.warn("[background] sombra failed; falling back to spectra", e);
      engine = null;
    }
  }
  if (!engine && want === "mock") {
    // Dev-only recording engine (T3.7): paints nothing, logs to window.__bgLog.
    engine = createMockEngine();
    caps = { ...engine.caps };
  }
  if (!engine) {
    engine = tryCss(target, initialOpts.colors);
    if (engine) caps = { ...engine.caps };
  }
  const director = createDirector({ initialOpts, chosenPreset, chosenPalette, effect, engine, caps });

  fadeInCanvas(0, engine && engine.id === "spectra" ? (ok) => engine._settle(ok) : null);
  // Any non-css engine that never draws (unsupported / no WebGL / no surface:
  // `ready` resolves false — or, against the contract, rejects) or that LOSES its
  // GL context later ("contextlost", T3.9a) falls back: a Sombra engine to spectra
  // (when spectraGL is there) and on to css; every other engine straight to css.
  // The director replays its state onto the next engine and destroys the failed one
  // (useEngine). One swap per engine; the css engine is the end of the chain.
  // (spectra settles `ready` via fadeInCanvas.)
  const lateSpectra = () => {
    try {
      const factory = typeof window.spectraGL === "function" ? window.spectraGL : null;
      if (!factory) return null;
      const opts = { ...initialOpts, colors: director.getPalette(), field: { ...initialOpts.field, seed: director.getSeed() } };
      const fx = factory({ target, ...opts });
      if (!fx) return null;
      const sp = createSpectraEngine(fx, { ...SPECTRA_CAPS });
      fadeInCanvas(0, (ok) => sp._settle(ok));
      if (IS_DEV_HOST) window.__spectra = fx;
      return sp;
    } catch (e) {
      console.warn("[background] spectraGL failed; falling back to css", e);
      return null;
    }
  };
  const watchEngine = (booted) => {
    if (!booted || booted.id === "css") return;
    let swapped = false;
    const toSpectra = booted.id === "sombra";
    const fallBack = (why) => {
      if (swapped) return;
      swapped = true;
      const sp = toSpectra ? lateSpectra() : null;
      console.warn(`[background] ${booted.id} ${why}; falling back to ${sp ? "spectra" : "css"}`);
      const next = sp || tryCss(target, director.getPalette());
      if (next) director.useEngine(next);
      if (sp) watchEngine(sp);
    };
    Promise.resolve(booted.ready).then((ok) => {
      if (!ok) fallBack("not ready");
    }, () => fallBack("not ready"));
    booted.on("contextlost", () => fallBack("lost its WebGL context"));
  };
  watchEngine(engine);

  // Debug globals — dev hosts only (never shipped to production).
  if (IS_DEV_HOST) {
    window.__spectra = effect;
    window.__chosenPreset = chosenPreset;
    window.__chosenPalette = chosenPalette;
  }

  if (engine) bindRerollKeys((kind, opts) => director.reroll(kind, opts));

  // Expose for debugging / manual poke on dev hosts only (e.g. __shaderCtl.dissolveField(0, 800)).
  if (typeof window !== "undefined" && IS_DEV_HOST) {
    director.engine = engine; // dev only (director API): the BackgroundEngine in use
    window.__shaderCtl = director;
  }
  // __bg is gated on isDevEnabled() (not IS_DEV_HOST like the legacy globals
  // above) per the T3.4 brief: it is the new dev surface and follows the opt-in
  // dev gate (loopback always; LAN/tailnet only with spendolas.dev=1).
  if (isDevEnabled()) window.__bg = director;
  return director;
}
