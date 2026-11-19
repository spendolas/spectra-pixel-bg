// CSS fallback BackgroundEngine (T3.6): a static three-stop gradient, used when
// spectraGL is unavailable (no Three.js / no WebGL / init failure) or requested
// with ?engine=css on a dev-enabled host. No clock, no GPU, nothing animates.
//
// Layering (PLAN §4 Phase 3): `el` is a BODY-LEVEL div inserted right after #bg
// (never inside it — #bg is fixed with z-index:auto, so a child would paint under
// the Video poster): position:fixed, z-index:1, pointer-events:none, and its
// top/left/width/height track #bg's rect (ResizeObserver on #bg + window resize).

export const CSS_CAPS = Object.freeze({
  stops: 3, perStopAlpha: false, fieldAlpha: false, balance: false, seed: false, freeze: false, gpu: false, clock: "wall",
});

/**
 * @param {string} target   the #bg selector
 * @param {string[]} colors initial palette (painted at once)
 * @returns {import("../types.js").BackgroundEngine}
 */
export function createCssEngine(target, colors) {
  const bg = document.querySelector(target);
  if (!bg) throw new Error(`css engine: no element for ${target}`);
  const el = document.createElement("div");
  el.className = "bg-engine-css";
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, { position: "fixed", zIndex: "1", pointerEvents: "none", margin: "0", opacity: "1" });
  bg.after(el);

  const track = () => {
    const r = bg.getBoundingClientRect();
    el.style.top = `${r.top}px`;
    el.style.left = `${r.left}px`;
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
  };
  track();
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(track) : null;
  if (ro) ro.observe(bg);
  window.addEventListener("resize", track);

  const paint = (hex) => {
    if (!Array.isArray(hex) || !hex.length) return;
    const c = [0, 1, 2].map((i) => hex[Math.min(i, hex.length - 1)]);
    el.style.background = `linear-gradient(135deg, ${c[0]}, ${c[1]}, ${c[2]})`;
  };
  paint(colors);

  const errorFns = [];
  let alive = true;
  return {
    id: "css",
    caps: CSS_CAPS,
    scenes: [],
    ready: Promise.resolve(true),
    el,
    writable: true, // internal: the option setters run
    setScene(scene, override) {
      paint(override !== undefined ? override : scene && scene.colors);
    },
    setPalette: paint,
    setStopAlpha(a) {
      if (!Array.isArray(a) || !a.length) return;
      const used = a.slice(0, CSS_CAPS.stops); // only the stops this engine renders
      const mean = used.reduce((s, x) => s + x, 0) / used.length;
      el.style.transition = "none";
      el.style.opacity = String(Math.max(0, Math.min(1, mean)));
    },
    setBalance() {},
    setOptions() {},
    setPlaying() {},
    on(type, fn) {
      if (type !== "error") return () => {};
      errorFns.push(fn);
      return () => {
        const i = errorFns.indexOf(fn);
        if (i >= 0) errorFns.splice(i, 1);
      };
    },
    destroy() {
      if (!alive) return;
      alive = false;
      if (ro) ro.disconnect();
      window.removeEventListener("resize", track);
      el.remove();
    },
  };
}
