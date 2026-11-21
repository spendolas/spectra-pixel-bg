// yardGL — production WebGL renderer for the Yard logo wall (global THREE r128,
// no build step, no ESM import of three — this file reads window.THREE, which
// index.html loads as a plain <script> before any module runs).
//
// What it does: while Yard is on screen, yard.js mounts a transparent
// full-viewport overlay canvas (fixed, z-index 9, pointer-events:none) that
// mirrors the DOM logo wall. Each live `.y-slot` gets one textured plane whose
// texture is the slot's SVG rasterised by the browser; every frame the planes
// copy their slot's current rect + opacity, so the DOM cascade/crossfade drives
// the GL wall. Rendering is two passes, hand-rolled (scene → render target →
// fullscreen quad through the pointer/touch-driven black-hole lens). Logo rolls
// call glitchSwap(), a GLSL port of swap.js's DOM "glitch" effect on one plane.
// The DOM logos are hidden only while a complete GL wall is drawn; any failure
// (no WebGL, a raster that fails, context loss) leaves or returns the DOM wall.
//
// Sizing is a per-frame SELF-HEAL rather than a `resize` listener: every rAF
// frame compares innerWidth/innerHeight/dpr against the last known values and,
// on change, resizes the renderer + render target and rebuilds the camera (the
// `resize` event proved unreliable in blackholeLab.js, where this pattern came
// from). No EffectComposer/RenderPass/ShaderPass — those are three.js addons,
// and only the core three.min.js is loaded globally (no import maps).

import { IS_DEV_HOST } from "./devHost.js";

// Ported VERBATIM from src/framework/blackholeLab.js (the dev-only three.js lab
// this module productionises) — plain GLSL, version-agnostic, works unchanged
// under r128. Matter-streaming lens: for each pixel within reach, accumulate
// samples along the radial line AWAY from the hole, offset by an
// inverse-square "pull". Near the hole the trail reaches far out, so the
// logo's outer matter is smeared into a stream toward the core — the logo
// disintegrates inward. Event horizon = the core goes to black (consumed).
// currentColor is preserved (we only move pixels). Pass-through (untouched
// sample) when `uActive < 0.5` — the resting wall uses the same shader, so
// there is no second code path.
const LENS_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const LENS_FRAG = `
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform vec2 uMouse; uniform float uAspect, uPull, uReach, uStreak, uHorizon, uFalloff, uActive;
  const int STEPS = 40;
  void main(){
    vec2 uv = vUv;
    vec2 d = uv - uMouse; d.x *= uAspect;
    float dist = length(d);
    if (uActive < 0.5 || dist > uReach) { gl_FragColor = texture2D(tDiffuse, uv); return; }
    float f = pow(1.0 - dist / uReach, uFalloff);        // 0 edge -> 1 core (inverse-square-ish)
    vec4 acc = vec4(0.0); float wsum = 0.0;
    for (int i = 0; i < STEPS; i++){
      float k = float(i) / float(STEPS - 1);
      float sc = 1.0 + uPull * f * k;                    // >1: sample further out -> matter sucked toward the hole
      vec4 s = texture2D(tDiffuse, uMouse + (uv - uMouse) * sc);
      float w = mix(1.0, 1.0 - uStreak, k);              // streak trail toward the core
      acc += s * w; wsum += w;
    }
    vec4 col = acc / wsum;
    float hzEdge = max(uHorizon, 1e-4); // guard: smoothstep(edge0, edge1, x) is undefined when edge0 == edge1 (uHorizon == 0 baked default)
    float hz = smoothstep(hzEdge * 0.4, hzEdge, dist); // event horizon: consume the core
    gl_FragColor = vec4(col.rgb * hz, col.a * hz);
  }`;

// GLSL port of the swap.js "glitch" DOM effect (SWAP_EFFECTS.glitch). The DOM
// version drives an SVG feTurbulence+feDisplacementMap filter + CSS transforms
// per frame; here the exact same look is rebuilt as a texture transition so it
// lives INSIDE the scene (one plane) and therefore composites automatically
// under the black-hole post pass. Each swap.js mechanic maps to a term:
//
//  - Displacement / tear: value-noise (posterized into `uPosterize` bands,
//    horizontal-band biased like feTurbulence baseFrequency "0.0006 block")
//    scaled by a block-quantized amplitude `round(tear·env·gate/6)·6`, offsets
//    the sample UV. `uGate` (stutter) and `uSeed` (per-frame reseed) come from JS.
//  - RGB split: R/B channels sampled at ±`uSplitPx` (px, env-scaled in JS);
//    renders independently of tear so split is its own knob (0 = off).
//  - Blur: small 5-tap box of radius `uBlur·env·gate` px.
//  - Slab jump + shear: whole-plane UV translate `uSlabPx` + skewY `uShearTan`.
//  - Mega-slabs: `uMega` horizontal bands keyed by floor(uv.y·uMega), each
//    shifted ±`uMegaAmt` px by a per-band hash, gated by `uMegaShow` (JS sets it
//    on peak frames env>0.4).
//  - Flashes: `uBright` (1.0 or 1.9) and `uInvert` (0/1) set per frame in JS.
//  - Crossfade: mix uFrom→uTo across a narrow window at uT≈0.5 (the `swapped`
//    gate) — the tear/slab noise masks the cut just like the DOM version.
// env = sin(π·uT): pristine from-logo at t=0, pristine to-logo at t=1.
const GLITCH_FRAG = `
  #define PI 3.14159265359
  varying vec2 vUv;
  uniform sampler2D uFrom, uTo;
  uniform vec2 uRes, uSlabPx, uFromScale, uToScale;
  uniform float uT, uSeed, uGate, uTear, uPosterize, uBlur, uSplitPx;
  uniform float uShearTan, uMega, uMegaAmt, uMegaShow, uBright, uInvert;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float inb(vec2 p){ return step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0); }

  // One tap of a TIGHT logo texture from padded-plane UV. The plane is padded
  // (padW×padH CSS px) but each texture covers only its own logo box, centred:
  // tuv = (uv-0.5)*scale+0.5 with scale = (padW/logoW, padH/logoH). Taps that
  // fall outside the logo box read transparent (inb mask), exactly like the
  // transparent margin the old padded raster carried.
  vec4 tap(sampler2D tex, vec2 uv, vec2 scale){
    vec2 tuv = (uv - 0.5) * scale + 0.5;
    return texture2D(tex, tuv) * inb(tuv);
  }
  vec4 sampleBlur(sampler2D tex, vec2 uv, float radPx, vec2 scale){
    if (radPx < 0.01) return tap(tex, uv, scale);
    vec2 r = vec2(radPx) / uRes;
    vec4 s = tap(tex, uv, scale) * 0.4;
    s += tap(tex, uv + vec2(r.x, 0.0), scale) * 0.15;
    s += tap(tex, uv - vec2(r.x, 0.0), scale) * 0.15;
    s += tap(tex, uv + vec2(0.0, r.y), scale) * 0.15;
    s += tap(tex, uv - vec2(0.0, r.y), scale) * 0.15;
    return s;
  }
  // Blur + chromatic-aberration channel split, as one source sample.
  vec4 sampleSrc(sampler2D tex, vec2 uv, float radPx, float caPx, vec2 scale){
    vec4 base = sampleBlur(tex, uv, radPx, scale);
    if (caPx < 0.01) return base;
    float caU = caPx / uRes.x;
    float r = sampleBlur(tex, uv + vec2(caU, 0.0), radPx, scale).r;
    float b = sampleBlur(tex, uv - vec2(caU, 0.0), radPx, scale).b;
    return vec4(r, base.g, b, base.a);
  }

  void main(){
    float env = sin(PI * uT);
    vec2 uv = vUv;
    vec2 duv = vec2(0.0);

    // whole-plane slab jump + vertical shear (skewY)
    duv.x -= uSlabPx.x / uRes.x;
    duv.y += uSlabPx.y / uRes.y;
    duv.y += (uv.x - 0.5) * uShearTan;

    // tear: posterized value-noise, block-quantized amplitude
    vec2 nc = vec2(uv.x * 0.8, uv.y * 26.0) + vec2(uSeed, uSeed * 0.3);
    float nv = vnoise(nc);
    float steps = max(2.0, uPosterize);
    nv = floor(nv * steps) / (steps - 1.0);
    float scaleT = floor((uTear * env * uGate) / 6.0 + 0.5) * 6.0;
    duv.x += (nv - 0.5) * 2.0 * scaleT / uRes.x;
    float nv2 = vnoise(nc + 11.3);
    duv.y += (nv2 - 0.5) * scaleT * 0.25 / uRes.y;

    // mega-slabs: banded horizontal shred on peak frames
    float band = floor(uv.y * uMega);
    float br = hash(vec2(band, floor(uSeed * 7.0))) * 2.0 - 1.0;
    duv.x += uMegaShow * br * uMegaAmt / uRes.x;

    vec2 suv = uv + duv;
    float radPx = uBlur * env * uGate;

    vec4 fromC = sampleSrc(uFrom, suv, radPx, uSplitPx, uFromScale);
    vec4 toC   = sampleSrc(uTo,   suv, radPx, uSplitPx, uToScale);
    vec4 col = mix(fromC, toC, smoothstep(0.45, 0.55, uT));
    col *= inb(suv);

    // digital flourishes: brightness pop + optional invert
    col.rgb *= uBright;
    col.rgb = mix(col.rgb, vec3(1.0) - col.rgb, uInvert);

    gl_FragColor = col;
  }`;

// Super-sample factor for logo rasterisation — the SVG is drawn to a canvas at
// (css × dpr × SS) so the CanvasTexture stays crisp under the lens/minification.
const SS = 2;

// Glitch breathing room. The glitch shader displaces logo pieces by up to
// ~64 px on X (tear 26 + slab 15 + megaAmt 23) plus a height-proportional shear;
// the resting logo plane/texture is sized exactly to the logo box, so anything
// pushed past that box has no quad surface and gets cropped at the edge (the DOM
// swap.js never clipped because its SVG filter region was 400% oversized). For
// the DURATION of a swap the glitch PLANE is grown by this margin on every side;
// the shader samples the cached TIGHT textures through a per-texture UV remap
// (each logo in its own box, transparent outside it — T1.12), so pieces move
// into the margin instead of being cut. `MIN` (CSS px) covers the px-based offsets; `FRAC`
// scales with the box so the shear (∝ plane height) also fits on large logos.
const GLITCH_PAD_MIN = 72;
const GLITCH_PAD_FRAC = 0.2;

// A logo raster that has not loaded after this long resolves `null` (treated
// exactly like an `onerror`), so a stuck Image can never hang build()/mount().
const RASTER_TIMEOUT_MS = 2000;

// Give the root <svg> explicit `width`/`height` attributes before it is
// rasterised through an <img>. The brand SVGs carry only a `viewBox`; some
// engines (historically Firefox) refuse to drawImage an SVG with no intrinsic
// size. The injected size is the viewBox CONTAIN-FIT into the raster box
// (unrounded) — exactly the concrete size a viewBox-only SVG already resolves
// to when drawn into that destination rect — so the intrinsic aspect and the
// rasterised resolution are unchanged. Falls back to the raster box when there
// is no parseable viewBox; left alone if the root tag already has a width/height.
const sizeSvg = (s, pw, ph) => {
  const open = s.match(/<svg\b[^>]*>/i);
  if (!open || /\swidth\s*=/i.test(open[0]) || /\sheight\s*=/i.test(open[0])) return s;
  const vb = open[0].match(/\sviewBox\s*=\s*["']\s*[-+\d.eE]+[\s,]+[-+\d.eE]+[\s,]+([\d.eE+]+)[\s,]+([\d.eE+]+)\s*["']/);
  let w = pw, h = ph;
  if (vb && +vb[1] > 0 && +vb[2] > 0) {
    const r = +vb[1] / +vb[2];
    if (pw / ph > r) {
      w = ph * r;
      h = ph;
    } else {
      w = pw;
      h = pw / r;
    }
  }
  return s.replace("<svg", `<svg width="${w}" height="${h}"`);
};

// Read the live Yard slots: `.y-slot` elements currently rendered (offsetParent
// !== null filters out slots hidden by the responsive layout), each paired
// with its `.y-logo-inner` rect + the logo's real resolved currentColor.
// build() turns these into the textured plane wall; mount() and build() also
// compare plane count against it to detect an incomplete wall.
const readSlots = () =>
  [...document.querySelectorAll(".y-slot")]
    .filter((s) => s.offsetParent !== null)
    .map((s) => {
      const inner = s.querySelector(".y-logo-inner");
      const svgEl = inner && inner.querySelector("svg");
      if (!svgEl) return null;
      const r = inner.getBoundingClientRect();
      return {
        el: s,
        svg: svgEl.outerHTML,
        color: getComputedStyle(svgEl).color || "#000",
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        w: r.width,
        h: r.height,
      };
    })
    .filter(Boolean);

export function initYardGL() {
  let active = false;

  // Re-entrancy guard for rapid enter/exit. `mount()` sets `active`
  // only AFTER an async `await build()`, so a second mount() during that await
  // would slip past an `if (active)` check; `mounting` blocks that. `generation`
  // is bumped by unmount() to invalidate any in-flight build — its continuation
  // checks the captured generation and bails rather than touching disposed state
  // (setting `active`, starting the loop, or adding meshes to a nulled scene).
  let mounting = false;
  let generation = 0;

  // T1.13 — the renderer, its canvas, the scene, the render target and the
  // lens post pass are created ONCE per page (lazily, by the first mount()) and
  // kept across Yard visits: one WebGL context per page however many round
  // trips. mount()/unmount() only attach/detach the canvas, start/stop the
  // loop and add/remove the hide style. They are rebuilt only after the
  // context is lost (`contextLost`), on the next mount().
  let renderer = null;
  let scene = null;
  let camera = null;
  let rt = null;
  let postScene = null;
  let postCamera = null;
  let postMaterial = null;
  let postMesh = null;
  let canvas = null;
  // `webglcontextlost` handler bound to the CURRENT canvas (see mount()); kept so
  // unmount() can remove it from the canvas it is tearing down.
  let onContextLost = null;
  let contextLost = false;
  let hideStyle = null;
  let rafId = null;
  // True from mount()'s GL setup until unmount(): build() only runs (and only
  // adds planes to the persistent scene) inside a mount session.
  let session = false;
  // Idle skip (T1.13): renderFrame() draws only when something changed — the
  // plane set or a plane material/texture (needsRender), a plane rect/opacity
  // (syncPlanes), the viewport (syncSize), a glitch in flight, or the lens
  // still active. Otherwise the last presented frame stays on screen.
  let needsRender = false;

  let lastW = 0;
  let lastH = 0;
  let lastDpr = 0;

  // The textured logo wall. `planes` holds one entry per live slot,
  // pairing the mesh with the DOM elements it mirrors every frame (innerEl for
  // the rect → position/scale, logoEl for the cascade/crossfade opacity).
  // `texCache` keys rasterised CanvasTextures by brand id + resolved colour +
  // raster size + dpr, so a rebuild (roll re-sync) reuses textures unless the
  // wash colour, the logo box or the dpr changed, in which case the new key
  // forces a re-raster at the right resolution. The cache OWNS the textures'
  // lifecycle — planes are disposed (geometry+material) on rebuild without
  // touching their maps; the cache is disposed+cleared in unmount().
  let planes = [];
  let building = false;
  let dirty = false; // a build() was requested while one was in flight → re-run
  const texCache = new Map();

  // `blackhole` is the lens: tuned live via blackholeLab.js's dev panel
  // (bound directly to this object through the dev-only `window.__yardGL`) —
  // exposed on `params` so the shape matches the module's public API contract
  // (the caller gets `params` back from initYardGL()). There is no
  // `params.glitch`: yard.js's roll engine always calls
  // `gl.glitchSwap(..., GLITCH, opts)` with swap.js's shared `GLITCH` object,
  // so glitchLab.js binds its knobs to that shared object instead.
  const params = {
    blackhole: { pull: 0.2, reach: 0.42, streak: 0.54, horizon: 0, falloff: 3.9, ease: 0.21 },
  };

  // Lens pointer/touch state. `tx,ty` is the target in normalized coords
  // (y-up, i.e. already flipped from screen space); `mx,my` is the eased
  // value actually fed to `uMouse`. `lastMove` timestamps the most recent
  // move so the per-frame idle-decay can zero `activeFlag` after 450ms of no
  // input — this is what makes the wall "rest clean" (no stuck lens frame)
  // rather than requiring an explicit pointerleave/touchend.
  let mx = 0.5, my = 0.5, tx = 0.5, ty = 0.5, eAct = 0, lastMove = -1e9;

  const isMobileInput = () =>
    matchMedia("(max-width: 768px)").matches || matchMedia("(pointer: coarse)").matches;

  const onPointerMove = (e) => {
    tx = e.clientX / innerWidth;
    ty = 1 - e.clientY / innerHeight;
    lastMove = performance.now();
  };
  // Mobile: follow the touch point (touchstart so a first tap without a drag
  // already engages the lens, touchmove so it tracks while dragging).
  const onTouchMove = (e) => {
    const t = e.touches[0];
    if (!t) return;
    tx = t.clientX / innerWidth;
    ty = 1 - t.clientY / innerHeight;
    lastMove = performance.now();
  };

  // Ease `uMouse`/`uActive` toward their targets and push the baked
  // `params.blackhole` knobs into the lens uniforms every frame. `eAct` is
  // the eased activity ratio (0..1) fed straight to `uActive` — the shader's
  // own `uActive < 0.5` gate is what actually snaps the lens off once the
  // eased value decays past the idle window, so no separate threshold is
  // needed here.
  const updateLens = () => {
    const b = params.blackhole;
    const activeFlag = performance.now() - lastMove > 450 ? 0 : 1;
    mx += (tx - mx) * b.ease;
    my += (ty - my) * b.ease;
    eAct += (activeFlag - eAct) * b.ease;
    const u = postMaterial.uniforms;
    u.uMouse.value.set(mx, my);
    u.uPull.value = b.pull;
    u.uReach.value = b.reach;
    u.uStreak.value = b.streak;
    u.uHorizon.value = b.horizon;
    u.uFalloff.value = b.falloff;
    u.uActive.value = eAct;
  };

  const makeCamera = (THREE, w, h) => {
    const cam = new THREE.OrthographicCamera(w / -2, w / 2, h / 2, h / -2, 0.1, 100);
    cam.position.z = 10;
    return cam;
  };

  // Dispose every geometry/material currently in `scene` and empty it (the
  // scene itself is persistent). Textures (the logo maps) are intentionally
  // NOT disposed here — their lifecycle is owned by `texCache`, which is
  // disposed+cleared separately in unmount().
  const disposeScene = () => {
    if (!scene) return;
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose());
      }
    });
    while (scene.children.length) scene.remove(scene.children[0]);
  };

  // Screen-space (top-left origin, y-down) → world/ortho space (centre origin,
  // y-up). The ortho camera spans [-w/2, w/2] × [-h/2, h/2] in CSS px, so a DOM
  // point maps 1:1 in magnitude with the y axis flipped.
  const worldOf = (cx, cy) => ({ x: cx - innerWidth / 2, y: -(cy - innerHeight / 2) });

  // Rasterise a logo SVG to a canvas by letting the BROWSER render it natively
  // (clips, masks, holes, currentColor all resolved) — far more faithful than
  // reconstructing per-path meshes with SVGLoader. `color` is injected as the
  // root `color` so `fill="currentColor"` paths resolve to the exact Figma ink.
  const svgToCanvas = (svgHTML, color, w, h) =>
    new Promise((resolve) => {
      let s = svgHTML;
      if (!/xmlns=/.test(s)) s = s.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      s = s.replace("<svg", `<svg style="color:${color}"`);
      const img = new Image();
      const dpr = Math.min(devicePixelRatio, 2);
      const cw = Math.max(2, Math.round(w * dpr * SS)), ch = Math.max(2, Math.round(h * dpr * SS));
      s = sizeSvg(s, cw, ch);
      // Settle exactly once: load, error, a throw while drawing, or the timeout.
      let settled = false;
      const settle = (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        img.onload = img.onerror = null;
        resolve(v);
      };
      const timer = setTimeout(() => settle(null), RASTER_TIMEOUT_MS);
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = cw;
          c.height = ch;
          c.getContext("2d").drawImage(img, 0, 0, cw, ch);
          settle(c);
        } catch (_) {
          settle(null);
        }
      };
      img.onerror = () => settle(null);
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
    });

  // Cache-or-rasterise a CanvasTexture for a brand+colour at a size. Key is
  // brand id (or, as a fallback, the raw svg string) + resolved colour + the
  // raster size in device px + dpr: same brand, wash colour and box reuse the
  // texture across rebuilds; a colour, size or dpr change re-rasters (so a
  // resize or a monitor switch never stretches a stale raster). A raster that
  // lands after unmount() (generation changed) is dropped, not cached — the
  // cache was already cleared and nothing would ever dispose it.
  // r128 uses `tex.encoding = THREE.sRGBEncoding` (NOT `.colorSpace`).
  const texFor = async (brandKey, svgHTML, color, w, h) => {
    const THREE = window.THREE;
    const gen = generation;
    const dpr = Math.min(devicePixelRatio, 2);
    const cw = Math.max(2, Math.round(w * dpr * SS)), ch = Math.max(2, Math.round(h * dpr * SS));
    const key = brandKey + "|" + color + "|" + cw + "x" + ch + "@" + dpr;
    const cached = texCache.get(key);
    if (cached) return cached;
    const canvas2d = await svgToCanvas(svgHTML, color, w, h);
    if (!canvas2d || gen !== generation) return null;
    const tex = new THREE.CanvasTexture(canvas2d);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.encoding = THREE.sRGBEncoding;
    texCache.set(key, tex);
    return tex;
  };

  // (Re)build the plane wall from the live DOM. Rasterisation is async (Image
  // load), so build() awaits every texture before swapping the scene contents.
  // A `building` flag guards against concurrent rebuilds (e.g. a roll re-sync
  // or a breakpoint flip landing mid-build). A request that arrives while a
  // build is in flight is not dropped: it sets `dirty`, and the in-flight
  // build runs one more pass when it finishes, so the plane set always ends up
  // matching the DOM as of the LAST request (and an awaiting caller — mount() —
  // waits for that final pass). The pass is tied to the mount `generation`, so
  // a build that outlives an unmount() never touches a later mount's scene.
  const build = async () => {
    if (!scene || !session) return;
    if (building) {
      dirty = true;
      return;
    }
    building = true;
    const gen = generation;
    try {
      let complete = true;
      do {
        dirty = false;
        complete = await buildPass(gen);
      } while (dirty && scene && gen === generation);
      // A rebuild of a LIVE wall (resize re-sync, roll re-sync) whose last pass
      // dropped a slot (raster failed / timed out) would leave a hole: the DOM
      // logos are hidden and that slot has no plane. Fall back to the DOM wall.
      // (During mount() `active` is still false; mount() runs its own check.)
      if (!complete && active && gen === generation) unmount();
    } finally {
      if (gen === generation) {
        building = false;
        dirty = false;
      }
    }
  };

  const buildPass = async (gen) => {
    const THREE = window.THREE;
    const slots = readSlots();
    const built = await Promise.all(
      slots.map(async (sl) => {
        const logoEl = sl.el.querySelector(".y-logo");
        const innerEl = sl.el.querySelector(".y-logo-inner");
        if (!innerEl) return null;
        const brandKey = (logoEl && logoEl.dataset.brand) || sl.svg;
        const tex = await texFor(brandKey, sl.svg, sl.color, sl.w, sl.h);
        if (!tex) return null;
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        // Stash the real plain MeshBasicMaterial on the plane: glitchSwap must
        // ALWAYS restore from this, never from a captured `mesh.material`
        // (which can be a live glitch ShaderMaterial under re-entrancy).
        return { slotEl: sl.el, logoEl, innerEl, mesh, plainMat: mat, glitchToken: null, glitchPad: null, px: NaN, py: NaN, psx: NaN, psy: NaN, pop: NaN, pmat: null };
      })
    );

    // unmount() may have run during the async rasterise above (nulling
    // `scene`, bumping `generation`); bail before adding meshes to a disposed
    // — or a newer mount's — scene. The planes built by this pass were never
    // added to a scene, so dispose them here (their textures are cache-owned).
    if (!scene || !session || gen !== generation) {
      built.forEach((p) => {
        if (!p) return;
        p.mesh.geometry.dispose();
        p.plainMat.dispose();
      });
      return true;
    }

    // Swap: remove + dispose the previous planes (geometry+material only —
    // textures belong to texCache), then add the freshly built ones. A plane
    // that is mid-glitch carries the glitch ShaderMaterial: put its plain
    // material back first so the plain one is what gets disposed here (the
    // glitch loop sees the plane is no longer live and disposes its own).
    planes.forEach((p) => {
      scene.remove(p.mesh);
      p.mesh.material = p.plainMat;
      p.mesh.geometry.dispose();
      p.plainMat.dispose();
    });
    planes = [];
    built.filter(Boolean).forEach((p) => {
      scene.add(p.mesh);
      planes.push(p);
    });
    needsRender = true;
    // Complete = every slot read at the start of this pass got a plane.
    return built.every(Boolean);
  };

  // Per-frame DOM mirror (the core of the "no re-tune" design): read each live
  // slot's CURRENT `.y-logo-inner` rect (reflects the running cascade transform)
  // and `.y-logo` opacity, and drive the plane's position/scale/opacity. The DOM
  // logos are hidden but still laid out, so their geometry stays authoritative.
  //
  // The roll engine briefly puts TWO `.y-logo` elements in a slot (old `fromEl`
  // + new `toEl`) then removes `fromEl` — so the refs cached at build() time can
  // point at an element that's since been removed from the DOM (a zero rect
  // forever after). Re-resolve from the stable `slotEl` every frame instead;
  // `querySelector` returns the first match in document order, which is always
  // the surviving element post-swap. If a slot transiently has no logo element,
  // zero its opacity for this frame rather than leaving a stale rect.
  const syncPlanes = () => {
    // Returns true when any plane's position/scale/opacity/material differs
    // from the last frame (idle skip, T1.13).
    let changed = false;
    for (const p of planes) {
      const innerEl = p.slotEl.querySelector(".y-logo-inner");
      let x = p.px, y = p.py, sx = p.psx, sy = p.psy, op = 0;
      if (innerEl) {
        const logoEl = p.slotEl.querySelector(".y-logo");
        const r = innerEl.getBoundingClientRect();
        const w = worldOf(r.left + r.width / 2, r.top + r.height / 2);
        // During a glitch the plane is grown by `glitchPad` so displaced pieces
        // render into the margin instead of clipping at the logo box; at rest
        // `glitchPad` is null → tight scale. The centre (position) is the rect
        // centre in BOTH cases and the glitch shader remaps each tight texture
        // into its own logo box at the plane centre, so the logo's on-screen
        // size/place is identical whether or not the pad is active.
        const pad = p.glitchPad;
        x = w.x;
        y = w.y;
        sx = r.width * (pad ? pad.sx : 1);
        sy = r.height * (pad ? pad.sy : 1);
        op = logoEl ? +getComputedStyle(logoEl).opacity : 0;
        p.mesh.position.set(x, y, 0);
        p.mesh.scale.set(sx, sy, 1);
      }
      p.mesh.material.opacity = op;
      if (p.px !== x || p.py !== y || p.psx !== sx || p.psy !== sy || p.pop !== op || p.pmat !== p.mesh.material) {
        changed = true;
        p.px = x;
        p.py = y;
        p.psx = sx;
        p.psy = sy;
        p.pop = op;
        p.pmat = p.mesh.material;
      }
    }
    return changed;
  };

  // Keep the renderer + render target + camera locked to the window EVERY
  // frame rather than trusting the `resize` event (see file header / the
  // blackholeLab.js precedent this is ported from). The render target is sized
  // in DEVICE pixels (CSS size × dpr), not CSS pixels — otherwise the
  // intermediate texture the post pass samples would be softer than the
  // on-screen canvas on retina displays.
  // Returns true when the size changed (and was re-applied) this frame.
  const syncSize = () => {
    const dpr = Math.min(devicePixelRatio, 2);
    if (innerWidth === lastW && innerHeight === lastH && dpr === lastDpr) return false;
    lastW = innerWidth;
    lastH = innerHeight;
    lastDpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(innerWidth, innerHeight);
    // Re-assert the CSS display size every time this fires (viewport change
    // or the periodic self-heal) — `setSize` should set these itself, but we
    // don't rely on that alone since a stray cssText write elsewhere (as in
    // mount()) can wipe them; keeping the canvas element's own style in sync
    // here is what actually keeps it 1:1 with the viewport, not ×dpr.
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    rt.setSize(Math.max(1, Math.round(innerWidth * dpr)), Math.max(1, Math.round(innerHeight * dpr)));
    camera = makeCamera(window.THREE, innerWidth, innerHeight);
    if (postMaterial) postMaterial.uniforms.uAspect.value = innerWidth / innerHeight;
    return true;
  };

  const renderFrame = () => {
    rafId = requestAnimationFrame(renderFrame);
    const resized = syncSize();
    const moved = syncPlanes();
    updateLens();
    const glitching = planes.some((p) => p.glitchToken !== null);
    // Idle skip (T1.13): nothing changed and the lens is at rest → keep the
    // last presented frame. eAct < 1e-3 is far below the shader's own
    // `uActive < 0.5` pass-through gate, so the skipped frame is identical.
    if (!needsRender && !resized && !moved && !glitching && eAct < 1e-3) return;
    needsRender = false;
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
  };

  // Drop the persistent GL objects (only after a context loss, or a setup
  // that threw half-way). The canvas is detached and its context-lost listener
  // removed; the next mount() builds a fresh renderer.
  const teardownGL = () => {
    if (canvas && onContextLost) canvas.removeEventListener("webglcontextlost", onContextLost);
    onContextLost = null;
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    disposeScene();
    if (postMesh) postMesh.geometry.dispose();
    if (postMaterial) postMaterial.dispose();
    if (rt) rt.dispose();
    if (renderer) {
      try {
        renderer.dispose();
      } catch (_) {}
    }
    renderer = null;
    canvas = null;
    scene = null;
    camera = null;
    rt = null;
    postScene = null;
    postCamera = null;
    postMaterial = null;
    postMesh = null;
    contextLost = false;
    lastW = 0;
    lastH = 0;
    lastDpr = 0;
  };

  // Create the renderer, canvas, scene, render target and lens post pass —
  // once per page (T1.13), or again after a context loss. Returns false when
  // WebGL is unavailable (or setup throws), leaving nothing behind.
  const setupGL = () => {
    if (renderer && !contextLost) return true;
    if (renderer) teardownGL();
    const THREE = window.THREE;
    try {
      // T1.4c: antialias off — every draw is a screen-aligned textured quad
      // into a render target (MSAA does not apply to it), so the default
      // framebuffer's MSAA only cost memory. Separable: revert this line alone.
      renderer = new THREE.WebGLRenderer({ alpha: true, premultipliedAlpha: false, antialias: false });
    } catch (e) {
      renderer = null;
      return false;
    }
    try {
      renderer.setClearColor(0x000000, 0);
      canvas = renderer.domElement;
      // syncSize() (forced: lastW = 0) sizes the renderer + render target and
      // re-applies the CSS width/height after this cssText write — a <canvas>
      // with no explicit CSS size displays at its device-px buffer size.
      canvas.style.cssText = "position:fixed;inset:0;z-index:9;pointer-events:none";

      // T1.4b — context loss (GPU reset, or the browser evicting the oldest
      // context): prevent the default, drop the wall back to the DOM, and mark
      // the renderer dead so the next mount() rebuilds it. The listener closes
      // over ITS OWN canvas, so a loss on a discarded canvas never tears down
      // the current one.
      const thisCanvas = canvas;
      onContextLost = (e) => {
        e.preventDefault();
        if (canvas !== thisCanvas) return;
        contextLost = true;
        if (active) unmount();
      };
      thisCanvas.addEventListener("webglcontextlost", onContextLost);

      scene = new THREE.Scene();
      rt = new THREE.WebGLRenderTarget(1, 1);
      lastW = 0;
      lastH = 0;
      lastDpr = 0;

      // Fullscreen quad post pass: its own ortho camera + a PlaneGeometry(2,2)
      // spanning clip space, sampling `rt` through the black-hole lens shader.
      // The lens itself gates pass-through via `uActive < 0.5`, so
      // there's no separate pass-through material to swap between.
      postScene = new THREE.Scene();
      postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      postMaterial = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: rt.texture },
          uMouse: { value: new THREE.Vector2(0.5, 0.5) },
          uAspect: { value: innerWidth / innerHeight },
          uPull: { value: params.blackhole.pull },
          uReach: { value: params.blackhole.reach },
          uStreak: { value: params.blackhole.streak },
          uHorizon: { value: params.blackhole.horizon },
          uFalloff: { value: params.blackhole.falloff },
          uActive: { value: 0 },
        },
        vertexShader: LENS_VERT,
        fragmentShader: LENS_FRAG,
        depthTest: false,
        depthWrite: false,
      });
      postMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial);
      postScene.add(postMesh);
      return true;
    } catch (_) {
      teardownGL();
      return false;
    }
  };

  async function mount() {
    // Reduced-motion / capability guard, checked FIRST (before the
    // re-entrancy check, before any renderer/canvas/DOM work): if the OS-level
    // "prefers-reduced-motion: reduce" is set, don't mount the WebGL wall at
    // all. `active` stays false, no canvas is created, no DOM logos are
    // hidden — the DOM wall + swap.js's DOM `glitch` effect render as the
    // fallback (yard.js's roll engine calls gl.glitchSwap() only while
    // `gl.active` is true, and swapBrand() otherwise). Combined with the
    // WebGL-unavailable guard just below (renderer construction throws →
    // return without mounting), this makes "reduced-motion OR no WebGL → DOM
    // fallback" the complete rule.
    //
    // T1.4a — never a blank wall: mount() resolves `true` when the WebGL wall
    // is on screen and `false` when the DOM wall stays (reduced motion, no
    // THREE/WebGL, a build that failed or produced fewer planes than there are
    // live slots, an unmount during the build, or any throw). It never
    // rejects. The DOM logos are hidden and the canvas attached only AFTER a
    // complete build, in the same task as the first rendered frame.
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    // Re-entrancy: never double-mount. `mounting` covers the window between
    // here and `active = true` (which only lands after `await build()`).
    if (active || mounting) return active;
    if (typeof document === "undefined" || typeof window === "undefined" || !window.THREE) return false;
    mounting = true;
    // Capture the mount generation; unmount() bumps it to signal "abandon".
    const gen = generation;
    try {
    // Persistent GL (T1.4c antialias off, T1.4b canvas-scoped context-lost
    // listener): created on the first mount, reused afterwards. WebGL
    // unavailable → leave `active` false and mount nothing.
    if (!setupGL()) return false;
    // Size the (detached) canvas, renderer, render target and camera to the
    // current viewport before the build reads slot rects.
    lastW = 0;
    syncSize();
    session = true;

    // Lens input: pointermove always (covers desktop, and mice on hybrid
    // devices); touchstart/touchmove additionally on mobile so the hole
    // follows the touch point directly rather than waiting on emulated mouse
    // events (which some mobile browsers suppress or delay).
    addEventListener("pointermove", onPointerMove);
    if (isMobileInput()) {
      addEventListener("touchstart", onTouchMove, { passive: true });
      addEventListener("touchmove", onTouchMove, { passive: true });
    }

    // Build the textured plane wall from the live DOM slots before showing any
    // frames — rasterisation is async, so await it so the first rendered frame
    // already carries the logos rather than an empty wall.
    await build();

    // If unmount() ran during the async build above, `generation` advanced —
    // everything we set up has already been torn down; do not resurrect it.
    if (gen !== generation) return false;

    // Partial build (a raster failed / timed out, so a slot has no plane), or
    // the context was lost while building: tear down and leave the DOM wall
    // visible rather than show a wall with holes — or nothing at all.
    if (contextLost || planes.length !== readSlots().length) {
      unmount();
      return false;
    }

    // Complete build: attach the canvas, hide the DOM logos and draw the first
    // frame in the same task, so no paint ever shows neither wall.
    document.body.appendChild(canvas);
    if (!hideStyle) {
      hideStyle = document.createElement("style");
      hideStyle.textContent = ".y-slot .y-logo{visibility:hidden!important}";
    }
    document.head.appendChild(hideStyle);

    active = true;
    needsRender = true;
    renderFrame();
    return true;
    } catch (_) {
      // Any throw (build, raster, renderer setup, first frame): drop whatever
      // this mount created — unless an unmount() already did — and fall back.
      if (gen === generation) unmount();
      return false;
    } finally {
      mounting = false;
    }
  }

  function unmount() {
    // Invalidate any in-flight mount()/build() continuation before disposing.
    generation++;
    session = false;
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;

    // Safe to call even if touch listeners were never bound (desktop
    // mount) — removeEventListener on an unregistered listener is a no-op.
    removeEventListener("pointermove", onPointerMove);
    removeEventListener("touchstart", onTouchMove);
    removeEventListener("touchmove", onTouchMove);

    if (hideStyle && hideStyle.parentNode) hideStyle.parentNode.removeChild(hideStyle);

    // Detach the persistent canvas (it keeps its context and its
    // context-lost listener for the next visit — T1.13).
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);

    // A mid-glitch plane carries the glitch ShaderMaterial; put its plain
    // material back so disposeScene() disposes the plain one (the glitch loop
    // sees `active` false on its next tick and disposes its own material).
    planes.forEach((p) => {
      p.mesh.material = p.plainMat;
    });
    disposeScene();
    planes = [];
    building = false;
    dirty = false;
    needsRender = false;
    // texCache owns the logo textures — dispose them here (disposeScene skips
    // maps on purpose) and clear the cache so a later mount() re-rasterises.
    texCache.forEach((tex) => tex.dispose());
    texCache.clear();
    // A context lost while mounted: drop the dead GL objects now; the next
    // mount() creates a fresh renderer.
    if (contextLost) teardownGL();

    active = false;
  }

  // Rasterise a live `.y-logo` element to a CanvasTexture at its CURRENT
  // resolved colour (so it matches the running wash), via the shared texFor
  // cache — same brand+colour+size+dpr key build() uses, so the texture is
  // reused whenever the logo box matches the one build() rasterised. Resolves
  // `{ tex, w, h }` — the texture plus the logo's OWN box (CSS px) it was
  // rasterised for, which the glitch shader needs for its per-texture UV remap
  // — or null.
  const texForLogo = async (logoEl) => {
    if (!logoEl) return null;
    const inner = logoEl.querySelector(".y-logo-inner");
    const svgEl = inner && inner.querySelector("svg");
    if (!svgEl) return null;
    const r = inner.getBoundingClientRect();
    const color = getComputedStyle(svgEl).color || "#000";
    const brandKey = logoEl.dataset.brand || svgEl.outerHTML;
    const tex = await texFor(brandKey, svgEl.outerHTML, color, r.width, r.height);
    return tex ? { tex, w: Math.max(1, r.width), h: Math.max(1, r.height) } : null;
  };

  // GLSL glitch transition (port of swap.js SWAP_EFFECTS.glitch) applied to a
  // single plane: rasterise from/to, swap the plane onto a dedicated glitch
  // ShaderMaterial, tick its uniforms over `glitch.duration`, then restore the
  // plain MeshBasicMaterial (its map pointed at the new logo) and resolve. The
  // black-hole lens is a separate post pass over the whole render target, so a
  // pointer sweep distorts this glitch automatically — nothing to wire here.
  //
  // `glitch` is always swap.js's shared `GLITCH` object (its only caller,
  // yard.js's roll engine, passes it explicitly). `opts.signal` (an
  // AbortSignal) resolves early + restores, matching swap.js re-entrancy when
  // a slot re-swaps mid-flight.
  function glitchSwap(slotEl, fromEl, toEl, glitch, opts = {}) {
    const THREE = window.THREE;
    const P = glitch;
    const signal = opts.signal || (glitch && glitch.signal) || null;
    const plane = planes.find((p) => p.slotEl === slotEl);
    // Nothing to animate: no plane, torn-down renderer, or no THREE. Resolve so
    // callers (the roll engine) never hang on a missing slot.
    if (!plane || !active || !THREE) return Promise.resolve();

    return (async () => {
      // Per-invocation identity so two glitch loops never race on one plane:
      // starting a glitch stamps `plane.glitchToken = token`; any earlier loop
      // still ticking sees the token change and bails without touching the
      // material the newer glitch now owns.
      const token = {};
      let glitchMat = null;
      // Tight, texCache-owned textures (never disposed here): `toTex` becomes
      // the resting plane's plainMat.map on completion.
      let toTex = null;
      let restored = false;

      // Restore the plane to its REAL plain MeshBasicMaterial (stashed on the
      // plane at build), never a captured `mesh.material`. Only re-point the
      // plane's material if this call still owns the plane (token unchanged) —
      // if superseded, the newer glitch owns `mesh.material`, so we just drop
      // our own glitch material. On natural completion repoint the plain map at
      // the incoming logo so the plane "sticks" on the new brand; on abort/bail
      // leave the map untouched so a re-swap decides what shows.
      const restore = (showTo) => {
        if (restored) return;
        restored = true;
        const owns = plane.glitchToken === token;
        if (owns) {
          const plainMat = plane.plainMat;
          if (plainMat) {
            if (showTo && toTex && plainMat.map !== toTex) {
              plainMat.map = toTex;
              plainMat.needsUpdate = true;
            }
            plane.mesh.material = plainMat;
          }
          plane.glitchToken = null;
          // Return the plane to tight scale (syncPlanes reads this). Only when we
          // still own the plane — a superseding glitch has set its OWN glitchPad,
          // which must survive our teardown.
          plane.glitchPad = null;
        }
        needsRender = true;
        if (glitchMat) glitchMat.dispose();
      };

      // Everything below is wrapped so the returned promise ALWAYS resolves
      // (never rejects): the roll engine awaits this before removing `fromEl`,
      // and a rejection would break the roll. Setup throws (texture load,
      // rect/style reads, ShaderMaterial construction) restore-if-swapped +
      // resolve, same as a completed swap.
      try {
        const [fromLoad, toLoad] = await Promise.all([texForLogo(fromEl), texForLogo(toEl)]);
        toTex = toLoad ? toLoad.tex : null;
        // Abort, missing textures, or a torn-down / rebuilt renderer (plane no
        // longer live) → leave the plane on its plain material and resolve.
        if ((signal && signal.aborted) || !toTex || !active || !planes.includes(plane)) return;

        const innerEl = slotEl.querySelector(".y-logo-inner");
        const rect = innerEl ? innerEl.getBoundingClientRect() : { width: 1, height: 1 };
        const resW = Math.max(1, rect.width), resH = Math.max(1, rect.height);

        // Padded plane for the glitch: grow the logo box by a margin on every
        // side so displaced pieces aren't clipped. `uRes` is the padded CSS size
        // so the shader's px→UV conversion moves pieces the same number of
        // on-screen px. Each TIGHT cached texture is mapped into its OWN logo box
        // centred on the plane (uFromScale/uToScale = padded ÷ own box), so the
        // incoming logo keeps its own DOM-box aspect instead of being squashed
        // into the outgoing logo's box (T1.12). No extra raster per swap.
        // Missing outgoing raster → show the incoming logo on both sides.
        const fromSrc = fromLoad || toLoad;
        const padX = Math.max(GLITCH_PAD_MIN, Math.round(resW * GLITCH_PAD_FRAC));
        const padY = Math.max(GLITCH_PAD_MIN, Math.round(resH * GLITCH_PAD_FRAC));
        // The pad is measured from the largest of the slot / from / to boxes, so
        // an incoming logo wider or taller than the outgoing one is never cut.
        const padW = Math.max(resW, fromSrc.w, toLoad.w) + padX * 2;
        const padH = Math.max(resH, fromSrc.h, toLoad.h) + padY * 2;

        glitchMat = new THREE.ShaderMaterial({
          uniforms: {
            uFrom: { value: fromSrc.tex },
            uTo: { value: toTex },
            uRes: { value: new THREE.Vector2(padW, padH) },
            uFromScale: { value: new THREE.Vector2(padW / fromSrc.w, padH / fromSrc.h) },
            uToScale: { value: new THREE.Vector2(padW / toLoad.w, padH / toLoad.h) },
            uSlabPx: { value: new THREE.Vector2(0, 0) },
            uT: { value: 0 },
            uSeed: { value: Math.random() * 90 },
            uGate: { value: 1 },
            uTear: { value: P.tear },
            uPosterize: { value: Math.max(2, P.posterize | 0) },
            uBlur: { value: P.blur },
            uSplitPx: { value: 0 },
            uShearTan: { value: 0 },
            uMega: { value: Math.max(1, P.mega | 0) },
            uMegaAmt: { value: P.megaAmt },
            uMegaShow: { value: 0 },
            uBright: { value: 1 },
            uInvert: { value: 0 },
          },
          vertexShader: LENS_VERT,
          fragmentShader: GLITCH_FRAG,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        });

        // Claim the plane (superseding any in-flight glitch) and swap on. Grow
        // the plane to the padded size (syncPlanes reads glitchPad each frame):
        // sx/sy are the padded-over-tight ratios, so the plane spans padW×padH
        // while the logo still lands at its exact rest size/place.
        plane.glitchToken = token;
        plane.glitchPad = { sx: padW / resW, sy: padH / resH };
        plane.mesh.material = glitchMat;

        const duration = P.duration || 500;
        const u = glitchMat.uniforms;
        const pick = (a) => a[(Math.random() * a.length) | 0];
        const rnd = (a, b) => a + Math.random() * (b - a);

        await new Promise((resolve) => {
          const t0 = performance.now();
          let frame = 0;
          const tick = (now) => {
            // Bail cleanly if aborted, superseded by a newer glitch on this
            // plane, or the renderer was unmounted / rebuilt (plane no longer
            // live) — never keep ticking against disposed textures/material.
            if (
              (signal && signal.aborted) ||
              plane.glitchToken !== token ||
              !active ||
              !planes.includes(plane)
            ) {
              restore(false);
              return resolve();
            }
            try {
              const t = Math.min(1, (now - t0) / duration);
              const env = Math.sin(Math.PI * t);
              frame++;
              // stutter gate (swap.js: full amplitude vs 0.12 duck)
              const gate = Math.random() < P.stutter / 100 ? 1 : 0.12;
              // RGB split: discrete jumps, absolute px, env-scaled (0 = off)
              const caMax = P.split * env;
              const ca = pick([caMax, caMax, caMax * 0.4, 0]);
              // whole-plane slab jump + shear
              const slab = env * pick([-1, 0, 1, 1, -1]) * rnd(P.slab * 0.4, P.slab);
              const yjit = env * rnd(-1.5, 1.5);
              const shear = P.shear ? env * pick([-1, 1, 0]) * rnd(P.shear * 0.3, P.shear) : 0;
              // flashes on peak frames
              const bright = P.bright && Math.random() < 0.22 * env ? 1.9 : 1.0;
              const invert = P.invert && Math.random() < 0.16 * env ? 1.0 : 0.0;
              const megaShow = P.mega > 0 && env > 0.4 && Math.random() < 0.85 ? 1.0 : 0.0;
              if (frame % 2 === 0) u.uSeed.value = Math.random() * 90;

              u.uT.value = t;
              u.uGate.value = gate;
              u.uSplitPx.value = ca;
              u.uSlabPx.value.set(slab, yjit);
              u.uShearTan.value = Math.tan((shear * Math.PI) / 180);
              u.uBright.value = bright;
              u.uInvert.value = invert;
              u.uMegaShow.value = megaShow;

              if (t < 1) requestAnimationFrame(tick);
              else { restore(true); resolve(); }
            } catch (_) {
              restore(true);
              resolve();
            }
          };
          requestAnimationFrame(tick);
        });
      } catch (_) {
        // Setup error → restore to plain (if we swapped) and RESOLVE.
        restore(false);
      }
    })();
  }

  const api = {
    mount,
    unmount,
    build,
    get active() {
      return active;
    },
    glitchSwap,
    params,
  };

  // Dev-only handle for the /lab/ panels (blackholeLab.js) and the harness.
  // Production never reads it (yard.js holds the api directly).
  if (IS_DEV_HOST && typeof window !== "undefined") window.__yardGL = api;
  return api;
}
