// Sombra BackgroundEngine (T4.5, dev-only until the owner flips the default).
// Drives one exported Sombra scene (.ombra) through its profile
// (src/assets/shaders/<id>/<id>.profile.json) with the vendored player.
// Contract: docs/refactor/sombra/CONTRACT.md. Spike inputs: docs/refactor/sombra/SPIKES.md.
//
// - Surface: body-level <div> right after #bg (never inside it), fixed, z-index 1,
//   pointer-events none, rect tracking #bg (ResizeObserver + window resize).
//   Starts at opacity 0; revealed (boot fade, canvasFadeMs) only after the first
//   frame drawn from the site's state — so no default / magenta frame is shown.
// - Backend: WebGPU first, WebGL2 as fallback (owner decision 2026-11-18). The
//   adapter mounts {src}; the player picks WebGPU when navigator.gpu exists and the
//   artifact carries WGSL, and falls back to WebGL2 itself when WebGPU is missing or
//   its init fails. (webgl2Only: true — a dev/test option — strips plan.wgsl in
//   memory and mounts inline instead.)
// - Device-pixel grid (T4.8/T4.9a): the shader sizes cells as
//   floor(size × pdpr + 0.5) backing px, pdpr = min(dpr, 2) (the player's cap), with
//   a grid centred on the backing store. Edges land on device pixels only when
//   (1) backing px = device px (no resampling), (2) the backing size is EVEN (else
//   the centre-anchored grid sits on a half pixel), (3) the canvas starts on a whole
//   device pixel, and (4) a cell is a whole number of device px. The adapter:
//   picks an even backing size B the player reproduces that OVERSCANS the surface
//   by a few device px (fitBacking; clipped, so no gap), lays the canvas out at
//   B / pdpr CSS px, scales it by pdpr / dpr when dpr > 2 (the player renders 2 px
//   per CSS px; we supersize and scale down so 1 backing px = 1 device px), places
//   it on a whole device pixel, and writes the dots knob as
//   round(base × dpr) / pdpr (pixelate = 8 × that), re-applied on DPR changes.
// - reducedMotion: "ignore" — the site owns its reduced-motion policy (director).
// - Failure → ready false (onError, sombra:error, no-op handle, profile/registry
//   errors, unresolved palette, or 8 s without load); the container is removed and
//   the boot chain falls back (spectra → css).
// - Context / device loss → "contextlost" (→ the site swaps to css, T3.9a), from
//   whichever arrives first: a raw webglcontextlost on the canvas (WebGL2), the
//   player's "contextlost" event (fired after it re-created the context / WebGPU
//   device), or its "error" event (restore failed). Once per scene.
// - Scene swap (T4.8): with ≥ 2 registry entries, a reroll that changes the seed
//   (R / O; P keeps it) mounts the next scene B in a hidden sibling surface with the
//   full current state, reveals it as an instant cut once ready, then releases A
//   (destroy + loseContext + remove). ≤ 2 contexts: a newer swap cancels a pending
//   one; a failing B leaves A in place. With one scene a reroll only reseeds.

import { loadProfile, resolveBindings, mapBalance, packSeed, viewportValue } from "../profile.js";
import { TIMINGS } from "../../framework/timings.js";
import { isDevEnabled } from "../../framework/devHost.js";

export const PLAYER_URL = new URL("../../vendor/sombra-player.0.1.0.9572b840.umd.js", import.meta.url).href;
// Product integration (owner decision): the site always runs the NEWEST player Sombra
// ships, via Sombra's moving "latest" alias. There is deliberately NO Subresource
// Integrity here (SRI cannot pin a moving file), so whatever sombra.sh serves runs on
// this origin with full page access; the vendored pinned copy above is used only when the
// remote fetch fails (offline, host down, timeout). To go back to a hash-pinned release,
// set `url` to a versioned file (…player.<x.y.z>.umd.js) and fill `integrity` with its
// sha384.
export const REMOTE_PLAYER = Object.freeze({
  url: "https://sombra.sh/embed/sombra-player.latest.umd.js",
  integrity: null,
});
export const REMOTE_PLAYER_TIMEOUT_MS = 2500;
export const MOCK_URL = new URL("../../dev/fixtures/mock-sombra.js", import.meta.url).href;
export const SHADERS_URL = new URL("../../assets/shaders/", import.meta.url).href;
export const LOAD_TIMEOUT_MS = 8000;

// Provisional caps until the profile resolves (a schema-1 parity scene has 4 colour
// stops). The director reads stops/slots/perStopAlpha at boot; resolved caps are on
// engine.resolvedCaps after load.
export const SOMBRA_CAPS = Object.freeze({
  stops: 4, slots: 4, perStopAlpha: true, fieldAlpha: true, balance: true, seed: true, freeze: true, gpu: true, clock: "wall",
});

// ── helpers ──────────────────────────────────────────────────────────────────────
const hexToRgb01 = (hex) => {
  let h = String(hex || "").replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v)));
const deviceDpr = () => (typeof window !== "undefined" && window.devicePixelRatio) || 1;
/** The DPR the player renders at (it caps at 2). */
export const playerDpr = (dpr) => Math.min(dpr, 2);
/**
 * Dots/pixelate knob value (player CSS px) for a cell of `cssPx` site CSS px that
 * is a whole number of DEVICE px: round(cssPx × dpr) / pdpr. With dpr ≤ 2 that is
 * round(cssPx × dpr) / dpr; at dpr 3 the canvas is supersized (1 backing px =
 * 1 device px) so the knob is divided by the player's 2.
 */
export const integerCell = (cssPx, dpr) => Math.max(1, Math.round(cssPx * dpr)) / playerDpr(dpr);

// ── Device-pixel-exact canvas placement (T4.8 → T4.9b) ─────────────────────────
// Facts: (a) browsers keep CSS lengths in layout units (Chrome: 1/64 px), so a CSS
// size / offset is only device-px exact when it is a multiple of 1/64 AND
// value × dpr is an integer; (b) real DPRs are often float32 (0.8999999761581421,
// 1.100000023841858), so B / dpr is never exactly representable — we use the
// nearby rational n / d instead (error ~1e-5 device px, harmless); (c) the player
// sizes its buffer as floor(round(clientWidth) × pdpr), pdpr = min(dpr, 2), which
// at a float32 DPR just below n / d lands 1 px short. We therefore lay the canvas's
// CONTENT box out at exactly B × d / n CSS px (bitmap drawn 1:1) and steer the
// player's clientWidth with transparent padding (clientWidth = content + padding)
// so floor(clientWidth × pdpr) === B. The padding sits beyond the content edge,
// outside the surface, clipped.
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a / gcd(a, b)) * b;
/** dpr ≈ n / d (smallest d ≤ 64 within 1e-5 per unit of d), or null. */
export const dprRational = (dpr) => {
  for (let d = 1; d <= 64; d++) {
    const n = Math.round(dpr * d);
    if (n > 0 && Math.abs(dpr * d - n) < 1e-5 * d) return [n, d];
  }
  return null;
};
/** Device-px step whose CSS length (step × d / n) is a whole layout unit. */
export const dprStep = (dpr) => {
  const r = dprRational(dpr);
  return r ? r[0] / gcd(r[0], 64 * r[1]) : 1;
};
// CSS px for `dev` device px: exact multiple of 1/64 when dpr is rational.
const cssOf = (dev, dpr) => {
  const r = dprRational(dpr);
  return r ? (dev * r[1]) / r[0] : Math.round((dev / dpr) * 64) / 64;
};
// Smallest player clientWidth m with floor(m × pdpr) === B, or null.
const clientFor = (B, pdpr) => {
  const m0 = Math.ceil(B / pdpr - 1e-6);
  for (let m = Math.max(1, m0 - 1); m <= m0 + 1; m++) if (Math.floor(m * pdpr) === B) return m;
  return null;
};

/**
 * One axis. B = backing size = displayed device px: EVEN (the shader grid is
 * centred on the backing store), a multiple of the layout step, and reachable by
 * the player (some integer clientWidth m gives floor(m × pdpr) === B). o = device
 * origin: whole device px, multiple of the step, centred (floor), the content box
 * covering [pos, pos + size]. Exact fit first (B = the box's device size, o = its
 * device position) when it qualifies — no overscan, no offset (T4.8's 100 % cases);
 * else the smallest qualifying B ≥ box + 2. Returns {B, o, m}.
 */
export const fitAxis = (pos, size, dpr) => {
  const pdpr = playerDpr(dpr);
  const unit = dprStep(dpr);
  const step = lcm(2, unit);
  const p0 = pos * dpr;
  const dev = size * dpr;
  const exact = Math.round(dev);
  const p0r = Math.round(p0);
  // tolerance 1e-3 device px: browser-zoom DPRs are often float32
  if (Math.abs(dev - exact) < 1e-3 && Math.abs(p0 - p0r) < 1e-3 && exact % step === 0 && p0r % unit === 0) {
    const m = clientFor(exact, pdpr);
    if (m != null) return { B: exact, o: p0r, m };
  }
  const need = Math.ceil(dev - 1e-3) + 2;
  let B = Math.ceil(need / step) * step;
  for (let k = 0; k < 128; k++, B += step) {
    const m = clientFor(B, pdpr);
    if (m == null) continue;
    const o = Math.floor((p0 - (B - dev) / 2 + 1e-3) / unit) * unit;
    if (o <= p0 + 1e-3 && o + B >= p0 + dev - 1e-3) return { B, o, m };
  }
  const B0 = Math.ceil(need / step) * step;
  return { B: B0, o: Math.floor(p0 - (B0 - dev) / 2), m: Math.round(B0 / pdpr) };
};
export const fitBacking = (cssPx, dpr) => fitAxis(0, cssPx, dpr).B;
/**
 * Canvas placement inside the surface. `box` = the surface's page rect (CSS px; it
 * tracks #bg). layout = content-box CSS px before the transform; pad = transparent
 * padding (CSS px, right / bottom) that makes the player's clientWidth/Height = m;
 * scale = pdpr / dpr (supersize + scale down above DPR 2); offset = CSS px inside
 * the surface (≤ 0: overscan, clipped).
 */
export const placeCanvas = (box, dpr) => {
  const pdpr = playerDpr(dpr);
  const left = box.left || 0;
  const top = box.top || 0;
  const x = fitAxis(left, box.width, dpr);
  const y = fitAxis(top, box.height, dpr);
  // content box in the canvas's own (pre-transform) CSS px: B backing px / pdpr
  const lay = (B) => (pdpr === dpr ? cssOf(B, dpr) : B / pdpr);
  const lw = lay(x.B);
  const lh = lay(y.B);
  return {
    backing: [x.B, y.B],
    layout: [lw, lh],
    pad: [Math.max(0, x.m - lw), Math.max(0, y.m - lh)],
    client: [x.m, y.m],
    scale: pdpr / dpr, // 1 for dpr ≤ 2; 2/3 at dpr 3
    offset: [cssOf(x.o, dpr) - left, cssOf(y.o, dpr) - top],
  };
};

// ── WebGPU device capture (T4.9b) ───────────────────────────────────────────────
// Player 0.1.0 on WebGPU: a lost device triggers a restore that re-requests a
// device on the consumed adapter, fails, logs console.error and emits NOTHING — so
// the site must watch the device itself. Primary: the canvas's GPUCanvasContext
// getConfiguration().device. Fallback (browsers without getConfiguration): while
// a mount is in flight, GPUAdapter.prototype.requestDevice is wrapped to record the
// devices it creates (restored as soon as no mount is pending).
let captureDepth = 0;
let capturedDevices = [];
let origRequestDevice = null;
function beginDeviceCapture() {
  const A = typeof GPUAdapter !== "undefined" ? GPUAdapter.prototype : null;
  if (!A || typeof A.requestDevice !== "function") return () => [];
  if (captureDepth++ === 0) {
    origRequestDevice = A.requestDevice;
    A.requestDevice = function (...args) {
      const p = origRequestDevice.apply(this, args);
      Promise.resolve(p).then((d) => d && capturedDevices.push(d), () => {});
      return p;
    };
  }
  const from = capturedDevices.length;
  let done = false;
  return () => {
    if (done) return [];
    done = true;
    const mine = capturedDevices.slice(from);
    if (--captureDepth === 0) {
      A.requestDevice = origRequestDevice;
      origRequestDevice = null;
      capturedDevices = [];
    }
    return mine;
  };
}
const canvasDevice = (canvas) => {
  try {
    const ctx = canvas && canvas.getContext && canvas.getContext("webgpu"); // null on a WebGL2 canvas
    const cfg = ctx && typeof ctx.getConfiguration === "function" ? ctx.getConfiguration() : null;
    return (cfg && cfg.device) || null;
  } catch (e) {
    return null;
  }
};

// Dev-only: ?player=local forces the vendored copy (offline tests, harness fallbacks).
const localPlayerOnly = () => {
  try {
    return isDevEnabled() && new URLSearchParams(location.search).get("player") === "local";
  } catch (e) {
    return false;
  }
};
let playerP = null;
const hasPlayer = () => typeof window !== "undefined" && window.Sombra && typeof window.Sombra.mount === "function";
// Load one player script; resolves window.Sombra or rejects. `remote` adds SRI + CORS
// and a timeout (a hung host must not stall the background).
function loadScript(src, remote) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    let done = false;
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(v);
    };
    const timer = remote
      ? setTimeout(() => {
          s.remove();
          finish(reject, new Error(`Sombra player timed out (${src})`));
        }, REMOTE_PLAYER_TIMEOUT_MS)
      : 0;
    s.src = src;
    s.async = true;
    if (remote) {
      if (remote.integrity) s.integrity = remote.integrity;
      s.crossOrigin = "anonymous";
    }
    s.onload = () => (hasPlayer() ? finish(resolve, window.Sombra) : finish(reject, new Error("player loaded but window.Sombra is missing")));
    s.onerror = () => finish(reject, new Error(`could not load the Sombra player (${src})`));
    document.head.appendChild(s);
  });
}
function ensurePlayer(src, remote) {
  if (hasPlayer()) return Promise.resolve(window.Sombra);
  if (!playerP) {
    playerP = (remote
      ? loadScript(remote.url, remote).catch((e) => {
          console.warn(`[background] sombra: remote player unavailable (${e.message}); using the vendored copy`);
          return loadScript(src, null);
        })
      : loadScript(src, null)
    ).catch((e) => {
      playerP = null; // allow a retry on the next engine
      throw e;
    });
  }
  return playerP;
}

const b64url = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
/** .ombra bytes → inline scene string without WGSL (WebGL2-only), or null if unsupported. */
export async function webgl2Scene(bytes) {
  if (typeof DecompressionStream !== "function" || typeof CompressionStream !== "function") return null;
  const inflate = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate")));
  const art = JSON.parse(await inflate.text());
  if (art.plan && art.plan.wgsl) delete art.plan.wgsl;
  const deflated = new Response(new Blob([JSON.stringify(art)]).stream().pipeThrough(new CompressionStream("deflate")));
  return b64url(new Uint8Array(await deflated.arrayBuffer()));
}

/**
 * @param {object} o
 * @param {string} o.target       the #bg selector
 * @param {string} o.sceneId      registry id (folder under assets/shaders/) of the first scene
 * @param {string[]} [o.scenes]   registry ids in registry order (engine.scenes; duplicates allowed)
 * @param {string[]} o.colors     boot palette (hex)
 * @param {[number,number]} [o.seed] boot site seed
 * @param {boolean} [o.mock]      use the dev mock player (dev/fixtures/mock-sombra.js)
 * @param {boolean} [o.webgl2Only=false] dev/test: strip WGSL in memory → WebGL2
 * @param {number} [o.timeoutMs]
 * @returns {import("../types.js").BackgroundEngine}
 */
/**
 * Registry presetMap lookup: {default, rules:[{noiseType, fractalType, scene}]}.
 * Returns the scene id for a spectra option set (field.noiseType/fractalType), or the
 * map's default (warn once) when nothing matches; null when there is no map.
 */
let warnedUnmapped = false;
export function resolveSceneId(presetMap, opts) {
  if (!presetMap || !Array.isArray(presetMap.rules)) return null;
  const f = (opts && opts.field) || {};
  const hit = presetMap.rules.find((r) => r.noiseType === f.noiseType && r.fractalType === f.fractalType);
  if (hit) return hit.scene;
  if (!warnedUnmapped) {
    warnedUnmapped = true;
    console.warn(`[background] sombra: no scene mapped for ${f.noiseType}/${f.fractalType}; using ${presetMap.default}`);
  }
  return presetMap.default || null;
}

export function createSombraEngine({ target, sceneId, scenes = [], presetMap = null, colors, seed, mock = false, webgl2Only = false, timeoutMs = LOAD_TIMEOUT_MS }) {
  const bg = document.querySelector(target);
  if (!bg) throw new Error(`sombra engine: no element for ${target}`);
  const ids = scenes.length ? scenes.slice() : sceneId ? [sceneId] : [];

  // Desired state (site units), buffered before load and re-applied to every scene.
  const desired = {
    palette: Array.isArray(colors) ? colors.slice() : [],
    alphas: null, // null = all 1
    balance: 0,
    seed: Array.isArray(seed) ? seed.slice() : null,
    playing: true,
  };
  const subs = { contextlost: [], contextrestored: [], error: [] }; // contextrestored: reserved (never emitted)
  const emit = (type, ev) => (subs[type] || []).slice().forEach((fn) => {
    try {
      fn(ev);
    } catch (e) {
      console.warn("[background] sombra", type, "handler failed", e);
    }
  });
  let live = null; // the scene on screen
  let pending = null; // a scene loading for a swap (≤ 1)
  let destroyed = false;

  const stopRgba = (i) => {
    const pal = desired.palette;
    const hex = pal.length ? pal[Math.min(i, pal.length - 1)] : "#000000";
    const a = desired.alphas ? desired.alphas[Math.min(i, desired.alphas.length - 1)] : 1;
    return [...hexToRgb01(hex), clamp01(a == null ? 1 : a)];
  };
  const seedFor = (i) => Math.min(packSeed(desired.seed, i), 999.999);
  const cellsFor = (params) => {
    if (!params.dots) return null;
    const base = Number.isFinite(params.dots.default) ? params.dots.default : 8;
    // params.dots.devicePx (site-value-fbm): dot is a fixed N DEVICE px at any DPR (cell = 8x dot).
    const cell = Number.isFinite(params.dots.devicePx) ? Math.max(1, Math.round(params.dots.devicePx)) / playerDpr(deviceDpr()) : integerCell(base, deviceDpr());
    const ratio = params.pixelate && Number.isFinite(params.pixelate.default) && base ? params.pixelate.default / base : 8;
    return { dots: cell, pixelate: cell * ratio };
  };

  // ── one mounted scene ─────────────────────────────────────────────────────────
  function createInstance(id, idx) {
    const el = document.createElement("div");
    el.className = "bg-engine-sombra";
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, { position: "fixed", zIndex: "1", pointerEvents: "none", margin: "0", opacity: "0", overflow: "hidden" });
    if (live && live.el.parentNode) live.el.after(el); // hidden sibling right after A (still right after #bg once A goes)
    else bg.after(el);
    const inst = { id, idx, el, handle: null, B: null, P: {}, caps: null, glCanvas: null, dead: false, lastDpr: deviceDpr(), lostSent: false };
    const track = () => {
      const r = bg.getBoundingClientRect();
      Object.assign(el.style, { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` });
    };
    track();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => inst.layout()) : null;
    if (ro) ro.observe(bg);
    const set = (key, v) => {
      if (inst.handle && !inst.dead) inst.handle.set(key, v);
    };
    inst.writePalette = () => inst.B && inst.B.palette.forEach((b, i) => set(b.key, stopRgba(i)));
    inst.writeBalance = () => inst.B && inst.B.balance && set(inst.B.balance.key, mapBalance(inst.B.balance, desired.balance));
    inst.writeSeed = () => inst.B && desired.seed && inst.B.seed.forEach((b, i) => set(b.key, seedFor(i)));
    inst.writeDpr = () => {
      inst.lastDpr = deviceDpr();
      const c = cellsFor(inst.P);
      if (!c) return;
      set(inst.P.dots.key, c.dots);
      if (inst.P.pixelate) set(inst.P.pixelate.key, c.pixelate);
    };
    // Viewport-derived knobs (params.<n>.viewport): rewritten on every resize.
    const vpSize = () => {
      const r = bg.getBoundingClientRect();
      return [r.width, r.height];
    };
    inst.writeViewport = () => {
      const sz = vpSize();
      Object.values(inst.P).forEach((p) => p.viewport && set(p.key, viewportValue(p, sz)));
    };
    inst.writeAll = () => {
      inst.writeViewport();
      inst.writePalette();
      inst.writeBalance();
      inst.writeSeed();
      inst.writeDpr();
    };
    // Canvas on the device-pixel grid (see placeCanvas / fitBacking).
    inst.fitCanvas = () => {
      const c = el.querySelector("canvas");
      if (!c) return;
      const r = el.getBoundingClientRect();
      const pl = placeCanvas({ left: r.left, top: r.top, width: r.width, height: r.height }, deviceDpr());
      Object.assign(c.style, {
        position: "absolute",
        boxSizing: "content-box",
        width: `${pl.layout[0]}px`,
        height: `${pl.layout[1]}px`,
        padding: `0 ${pl.pad[0]}px ${pl.pad[1]}px 0`, // steers the player's clientWidth/Height (transparent)
        left: `${pl.offset[0]}px`,
        top: `${pl.offset[1]}px`,
        transformOrigin: "0 0",
        transform: pl.scale === 1 ? "none" : `scale(${pl.scale})`,
      });
      if (inst.handle && typeof inst.handle.resize === "function") inst.handle.resize(); // repaint if stopped
    };
    inst.layout = () => {
      if (inst.dead) return;
      track();
      inst.fitCanvas();
      if (deviceDpr() !== inst.lastDpr) inst.writeDpr();
      inst.writeViewport();
    };
    const lost = (ev) => {
      if (inst.lostSent) return;
      inst.lostSent = true;
      onGlLost(ev);
    };
    const onGlLost = (ev) => {
      if (inst === live) emit("contextlost", ev);
      else if (inst === pending) {
        console.warn("[background] sombra: pending scene lost its context; swap abandoned");
        pending = null;
        inst.teardown();
      }
    };
    inst.load = async () => {
      if (!id) return inst.fail("no scene (empty registry?)");
      const base = new URL(`${id}/`, SHADERS_URL);
      const profile = await loadProfile(new URL(`${id}.profile.json`, base).href);
      const sceneUrl = new URL(profile.scene, base).href;
      const Sombra = await ensurePlayer(mock ? MOCK_URL : PLAYER_URL, mock || localPlayerOnly() ? null : REMOTE_PLAYER);
      let inline = null;
      if (webgl2Only && !mock) {
        const res = await fetch(sceneUrl);
        if (!res.ok) throw new Error(`scene ${sceneUrl} HTTP ${res.status}`);
        inline = await webgl2Scene(new Uint8Array(await res.arrayBuffer()));
      }
      if (inst.dead) return false;
      let errored = null;
      const onDomError = (e) => (errored = errored || (e.detail && e.detail.error) || new Error("sombra:error"));
      el.addEventListener("sombra:error", onDomError);
      // The player draws its first frame inside mount(), from the baked defaults +
      // `variables`: pass the full site state (the surface is still at opacity 0).
      const mountOpts = {
        fallback: false,
        reducedMotion: "ignore",
        autoplay: desired.playing,
        onError: (e) => (errored = errored || e || new Error("onError")),
      };
      if (inline) mountOpts.scene = inline;
      else mountOpts.src = sceneUrl;
      const v = {};
      profile.bindings.palette.forEach((b, i) => (v[b.key] = stopRgba(i)));
      if (profile.bindings.balance) v[profile.bindings.balance.key] = mapBalance(profile.bindings.balance, desired.balance);
      if (desired.seed) (profile.bindings.seed || []).forEach((b, i) => (v[b.key] = seedFor(i)));
      const cells = cellsFor(profile.params || {});
      if (cells) {
        v[profile.params.dots.key] = cells.dots;
        if (profile.params.pixelate) v[profile.params.pixelate.key] = cells.pixelate;
      }
      const vsz = (() => {
        const r = bg.getBoundingClientRect();
        return [r.width, r.height];
      })();
      Object.values(profile.params || {}).forEach((p) => p.viewport && (v[p.key] = viewportValue(p, vsz)));
      mountOpts.variables = v;
      let timer = null;
      const timeout = new Promise((r) => (timer = setTimeout(() => r("timeout"), timeoutMs)));
      const endCapture = beginDeviceCapture();
      const mountP = Promise.resolve(Sombra.mount(el, mountOpts));
      const capP = mountP.then(() => endCapture(), () => endCapture());
      const h = await Promise.race([mountP, timeout]);
      clearTimeout(timer);
      el.removeEventListener("sombra:error", onDomError);
      if (h === "timeout") {
        endCapture(); // never leave requestDevice wrapped
        // A mount that completes after we gave up must not leave a live context behind.
        mountP.then((late) => late && typeof late.destroy === "function" && late.destroy(), () => {});
        return inst.fail(`no load within ${timeoutMs} ms`);
      }
      inst.handle = h;
      if (inst.dead) {
        inst.release(); // cancelled while mounting (newer swap / destroy): free its context now
        return false;
      }
      if (errored) return inst.fail(`player error: ${errored.message || errored}`);
      if (!h || h.ok === false || typeof h.nodes !== "function" || !h.nodes().length) return inst.fail("player returned an empty handle");
      let resolved;
      try {
        resolved = resolveBindings(profile, h.nodes());
      } catch (e) {
        return inst.fail(e.message);
      }
      resolved.warnings.forEach((w) => console.warn("[background] sombra profile:", w));
      inst.B = resolved.bindings;
      inst.P = resolved.params;
      inst.caps = resolved.caps;
      if (typeof h.on === "function") {
        // The player re-creates the context / WebGPU device itself and then fires
        // "contextlost"; "error" = restore failed. Either way the site policy is the
        // one-way swap to css (T3.9a), as for a raw WebGL2 loss.
        h.on("contextlost", () => lost({ type: "sombra:contextlost" }));
        h.on("error", (err) => lost({ type: "sombra:error", error: err }));
      }
      inst.writeAll(); // re-apply the buffered state through the resolved bindings
      if (desired.playing) h.play();
      else h.pause();
      inst.glCanvas = el.querySelector("canvas");
      if (inst.glCanvas) inst.glCanvas.addEventListener("webglcontextlost", lost); // WebGL2 backend only
      // WebGPU: watch the device's `lost` promise (any loss we did not cause → css).
      const captured = (await capP) || [];
      const own = canvasDevice(inst.glCanvas); // certainly this scene's device
      // Fallback devices may belong to an overlapping mount (swap): there, ignore
      // reason "destroyed" (our own teardown of the other scene).
      const watch = (d, strict) => {
        if (!d || !d.lost || typeof d.lost.then !== "function") return false;
        d.lost.then((info) => {
          if (inst.dead) return;
          if (!strict && info && info.reason === "destroyed") return;
          lost({ type: "webgpu:devicelost", reason: info && info.reason, message: info && info.message });
        });
        return true;
      };
      inst.gpuWatched = (own && watch(own, true) ? 1 : 0) + (own ? 0 : captured.filter((d) => watch(d, false)).length);
      inst.fitCanvas();
      await new Promise((r) => requestAnimationFrame(() => r()));
      return !inst.dead;
    };
    inst.reveal = (fade) => {
      el.style.transition = fade ? `opacity ${TIMINGS.canvasFadeMs}ms ease` : "none";
      el.style.opacity = "1";
    };
    inst.fail = (why) => {
      console.warn(`[background] sombra (${id}): ${why}`);
      inst.teardown();
      return false;
    };
    // Free the player + its GL context (idempotent; also used for a mount that
    // completes after the instance was cancelled).
    inst.release = () => {
      const h = inst.handle;
      inst.handle = null;
      const c = el.querySelector("canvas");
      try {
        if (h && typeof h.destroy === "function") h.destroy(); // releases the WebGL2 context (P0)
      } catch (e) {
        console.warn("[background] sombra destroy failed", e);
      }
      try {
        const gl = c && c.getContext && c.getContext("webgl2");
        const ext = gl && !gl.isContextLost() && gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
      } catch (e) { /* best effort */ }
      el.remove();
    };
    inst.teardown = () => {
      if (inst.dead) return;
      inst.dead = true;
      if (ro) ro.disconnect();
      if (inst.glCanvas) inst.glCanvas.removeEventListener("webglcontextlost", lost);
      inst.release();
    };
    return inst;
  }

  // ── boot ──────────────────────────────────────────────────────────────────────────
  const onWinResize = () => {
    if (live) live.layout();
    if (pending) pending.layout();
  };
  window.addEventListener("resize", onWinResize);
  const first = Math.max(0, ids.indexOf(sceneId));
  live = createInstance(sceneId, first);
  const boot = live;
  const ready = boot
    .load()
    .catch((e) => boot.fail(e && e.message ? e.message : String(e)))
    .then((ok) => {
      if (!ok || destroyed) {
        if (live === boot) live = null;
        if (!destroyed) teardownAll();
        return false;
      }
      boot.reveal(true); // engine-owned boot fade (CONTRACT §9 step 5)
      engine.resolvedCaps = boot.caps;
      return true;
    });

  // ── swap ──────────────────────────────────────────────────────────────────────────
  const pickNext = () => {
    if (ids.length < 2 || !live) return -1;
    const others = ids.map((_, i) => i).filter((i) => i !== live.idx);
    return others[Math.floor(Math.random() * others.length)];
  };
  function swapTo(idx) {
    if (pending) {
      pending.teardown(); // newer swap wins: never more than two contexts
      pending = null;
    }
    const inst = createInstance(ids[idx], idx);
    pending = inst;
    inst
      .load()
      .catch((e) => inst.fail(e && e.message ? e.message : String(e)))
      .then((ok) => {
        if (pending !== inst || destroyed) {
          inst.teardown();
          return;
        }
        pending = null;
        if (!ok) {
          console.warn(`[background] sombra: swap to ${ids[idx]} failed; keeping ${live ? live.id : "nothing"}`);
          return;
        }
        const old = live;
        live = inst;
        inst.writeAll(); // anything set while B loaded
        inst.reveal(false); // instant cut, like spectra's reroll
        engine.resolvedCaps = inst.caps;
        engine.sceneId = inst.id;
        if (old) old.teardown();
      });
  }

  function teardownAll() {
    if (destroyed) return;
    destroyed = true;
    window.removeEventListener("resize", onWinResize);
    if (pending) pending.teardown();
    if (live) live.teardown();
    pending = null;
    live = null;
    Object.keys(subs).forEach((k) => (subs[k].length = 0));
  }
  const each = (fn) => {
    if (live) fn(live);
    if (pending) fn(pending);
  };

  const engine = {
    id: "sombra",
    caps: SOMBRA_CAPS,
    resolvedCaps: null,
    scenes: ids.slice(),
    ready,
    get el() {
      return live ? live.el : null;
    },
    writable: true,
    sceneId,
    get handle() {
      return live ? live.handle : null; // dev / harness only
    },
    get pendingSceneId() {
      return pending ? pending.id : null; // dev / harness only
    },
    setScene(scene, override) {
      // A reroll: new palette (+ new seed on R / O). With ≥ 2 scenes a seed change
      // swaps to another scene; otherwise (and for P) the live scene repaints/reseeds.
      // Spectra-only options (noise type, dot size, speed …) come from the scene file.
      const pal = override !== undefined ? override : scene && scene.colors;
      if (Array.isArray(pal)) desired.palette = pal.slice();
      const s = scene && scene.field && scene.field.seed;
      const seedChanged = Array.isArray(s) && s.length === 2 && !(desired.seed && desired.seed[0] === s[0] && desired.seed[1] === s[1]);
      if (seedChanged) desired.seed = s.slice();
      // Scene follows the chosen preset: swap only when the mapped scene differs
      // from the live (or already pending) one; a palette-only roll maps to the same id.
      let swapIdx = -1;
      if (presetMap && !destroyed) {
        const want = resolveSceneId(presetMap, scene);
        const cur = pending ? pending.id : live ? live.id : null;
        const wi = ids.indexOf(want);
        if (wi >= 0 && want !== cur) swapIdx = wi;
      }
      // When a swap is coming, the LIVE scene must not be repainted with the new
      // palette/seed first (it would flash the old scene in the new colours until
      // the new one loads); the incoming scene gets everything via writeAll().
      each((i) => {
        if (swapIdx >= 0 && i === live) return;
        i.writePalette();
        i.writeSeed();
      });
      if (presetMap && !destroyed) {
        if (swapIdx >= 0) swapTo(swapIdx);
        return;
      }
      if (seedChanged && !destroyed) {
        const next = pickNext();
        if (next >= 0) swapTo(next);
      }
    },
    setPalette(hex) {
      if (!Array.isArray(hex)) return;
      desired.palette = hex.slice();
      each((i) => i.writePalette());
    },
    setStopAlpha(a) {
      if (!Array.isArray(a) || !a.length) return;
      desired.alphas = a.slice();
      each((i) => i.writePalette());
    },
    setBalance(v) {
      if (!Number.isFinite(v)) return;
      desired.balance = v;
      each((i) => i.writeBalance());
    },
    setOptions() {},
    setPlaying(playing) {
      desired.playing = !!playing;
      each((i) => {
        if (!i.handle || i.dead) return;
        if (playing) i.handle.play();
        else i.handle.pause();
      });
    },
    on(type, fn) {
      if (!subs[type] || typeof fn !== "function") return () => {};
      subs[type].push(fn);
      return () => {
        const i = subs[type].indexOf(fn);
        if (i >= 0) subs[type].splice(i, 1);
      };
    },
    destroy: teardownAll,
  };
  return engine;
}
