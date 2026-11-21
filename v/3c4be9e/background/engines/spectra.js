// spectraGL BackgroundEngine + its canvas helpers (moved verbatim from
// src/framework/shader.js, T3.4). The ONLY module that calls the spectraGL handle.

import { TIMINGS } from "../../framework/timings.js";
import { safePresets } from "../config.js";

// Engine capabilities (spectra pixel mode): `stops` = colour stops the field
// blends (0–3); `slots` = length of the fork's uColorOpacity uniform array
// (float[7] — every colorOpacity payload must carry all 7).
export const SPECTRA_CAPS = Object.freeze({
  stops: 4, slots: 7, perStopAlpha: true, balance: true, seed: true, freeze: true, gpu: true, clock: "engine",
});

// The spectraGL display canvas. It is appended to <body> (not inside #bg) and is
// the only canvas carrying data-spectra-id — never fall back to "any canvas",
// which could match yardGL's overlay instead.
export const getCanvas = () => document.querySelector("[data-spectra-id]");

// onReady(ok) (optional) reports the outcome on the frames this already uses:
// true on the second frame after the canvas appears, false if it never does.
export const fadeInCanvas = (attempt = 0, onReady = null) => {
  const canvas = getCanvas();
  if (!canvas) {
    if (attempt < 60) requestAnimationFrame(() => fadeInCanvas(attempt + 1, onReady));
    else if (onReady) onReady(false);
    return;
  }
  canvas.style.opacity = "0";
  canvas.style.transition = `opacity ${TIMINGS.canvasFadeMs}ms ease`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      canvas.style.opacity = "1";
      if (onReady) onReady(true);
    });
  });
};

// ── spectra BackgroundEngine (T3.3) ──────────────────────────────────────────
// The ONLY place the spectraGL handle (`effect`) is called. Instant, idempotent
// setters — no tweening, no tokens, no keys (those stay in the controller).
// Each setter issues exactly the one updateOptions payload the controller used
// to send itself, so payloads and their order are unchanged.
//
// Spectra option names → what they mean on this site (pixel mode):
//   colors          palette stops (sRGB hex; stop 0 = the "off" dot colour)
//   colorOpacity    per-stop alpha (uColorOpacity, float[7]; stops 0–3 used)
//   fieldDensity    field balance (uFieldDensity): ≤ −1.0 empty, ≥ +0.985 full
//   field.seed      field seed [x, y]          field.flow   field drift
//   field.*         noise: noiseType, fractalType, octaves, lacunarity, gain,
//                   warpStrength, angle, boxFreq, min/max remap, debug
//   foldIntensity   dot size                   foldScale    zoom
//   colorBlend      dot shape                  rimFalloff   feed bias
//   colorBalance    per-stop weights           speed        clock speed
//   mode            "pixel" (the only mode the site uses)
//
// setScene(scene, colors?): `scene` is a full spectra option set built by the
// controller (buildOptions: preset + palette + seed — the controller keeps the
// Math.random() order); `colors` overrides its palette IN THE SAME payload (a
// reroll under an active treatment). setOptions(o) is a spectra-only passthrough
// for treatment extras (non-colour option deltas).
export const createSpectraEngine = (effect, caps) => {
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));
  // Event subscribers (on()), and the canvas listeners that feed them (T3.9a).
  // spectraGL renders through ONE shared THREE.WebGLRenderer on a private
  // OFFSCREEN canvas and copies frames to the visible 2D [data-spectra-id]
  // canvas, so the GL context events fire on the offscreen canvas: it is read via
  // spectraGL.glCanvas() (fork accessor). The listeners are attached once the
  // first frame is up (fadeInCanvas → _settle(true)); a context that is ALREADY
  // lost by then (gl.isContextLost()) is reported at once.
  const subs = { contextlost: [], contextrestored: [], error: [] };
  let watched = null; // [canvas, onLost, onRestored]
  let destroyed = false;
  const emit = (type, ev) => {
    if (destroyed) return;
    subs[type].slice().forEach((fn) => {
      try {
        fn(ev);
      } catch (e) {
        console.warn("[background] spectra", type, "handler failed", e);
      }
    });
  };
  const lib = () => (typeof window !== "undefined" && window.spectraGL) || null;
  const glCanvas = () => {
    const L = lib();
    return L && typeof L.glCanvas === "function" ? L.glCanvas() : null;
  };
  const glContext = () => {
    const L = lib();
    return L && typeof L.glContext === "function" ? L.glContext() : null;
  };
  const watch = () => {
    if (watched || destroyed) return;
    // The GL canvas; falls back to the visible canvas for a build without the
    // accessor (its 2D context never fires GL events, but it costs nothing).
    const canvas = glCanvas() || getCanvas();
    if (!canvas) return;
    const onLost = (ev) => emit("contextlost", ev);
    const onRestored = (ev) => emit("contextrestored", ev);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    watched = [canvas, onLost, onRestored];
    let gl = null;
    try {
      gl = glContext();
    } catch (e) {
      gl = null;
    }
    if (gl && typeof gl.isContextLost === "function" && gl.isContextLost()) emit("contextlost", null);
  };
  const update = (o) => effect.updateOptions(o);
  const engine = {
    id: "spectra",
    caps,
    scenes: safePresets.map((p) => p.name),
    ready,
    get el() {
      return getCanvas();
    },
    // Internal (not part of BackgroundEngine): can the option setters run?
    writable: typeof effect.updateOptions === "function",
    setScene(scene, colors) {
      update(colors !== undefined ? { ...scene, colors } : scene);
    },
    setPalette(hex) {
      update({ colors: hex });
    },
    setStopAlpha(a) {
      update({ colorOpacity: a });
    },
    setBalance(v) {
      update({ fieldDensity: v });
    },
    setOptions(o) {
      update(o);
    },
    setPlaying(playing) {
      if (playing) {
        if (typeof effect.play === "function") effect.play();
      } else if (typeof effect.pause === "function") effect.pause();
    },
    // Settles `ready` (first call wins): fadeInCanvas reports the first frame.
    // When the canvas is there, start watching it for context loss / restore.
    _settle(ok) {
      if (ok) watch();
      if (resolveReady) resolveReady(ok && effect.supported !== false);
      resolveReady = null;
    },
    // "contextlost" / "contextrestored" re-emit the canvas's webglcontextlost /
    // webglcontextrestored (the event is passed through); "error" is reserved.
    // Unknown types get a no-op unsubscribe.
    on(type, fn) {
      if (!subs[type] || typeof fn !== "function") return () => {};
      subs[type].push(fn);
      return () => {
        const i = subs[type].indexOf(fn);
        if (i >= 0) subs[type].splice(i, 1);
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      const canvas = getCanvas();
      if (watched) {
        watched[0].removeEventListener("webglcontextlost", watched[1]);
        watched[0].removeEventListener("webglcontextrestored", watched[2]);
        watched = null;
      }
      Object.keys(subs).forEach((k) => (subs[k].length = 0));
      if (typeof effect.destroy === "function") effect.destroy();
      if (canvas) {
        try {
          const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
          const ext = gl && gl.getExtension("WEBGL_lose_context");
          if (ext) ext.loseContext();
        } catch (e) {
          /* best effort */
        }
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    },
  };
  return engine;
};
