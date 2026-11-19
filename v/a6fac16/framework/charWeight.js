// Cursor-tracked variable font-weight for large display text. Characters within
// --pointer-radius of the cursor interpolate weight 400→700 via a cubic-bezier
// spatial falloff (with a slight undershoot below 400 at the rim). Reusable by
// any module; only the active module's instance should be bound. See DESIGN.md §7.

import { makeBezier } from "./bezier.js";
import { reduceMotion } from "./anim.js";

const BASE_WEIGHT = 400;
const PEAK_WEIGHT = 700;
const MIN_AXIS = 300;
const MAX_AXIS = 700;

export function createCharWeight() {
  const easeBezier = makeBezier(0.35, -0.35, 0.45, 1.0);

  const readRadius = () => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--pointer-radius")
      .trim();
    const v = parseFloat(raw);
    return isFinite(v) && v > 0 ? v : 300;
  };

  let RADIUS = readRadius();
  let els = [];
  let cache = []; // [{ el, cx, cy }]
  const dirty = new Set();
  let pointerX = -9999;
  let pointerY = -9999;
  let rafScheduled = false;
  let bound = false;
  let helper = null;

  const refresh = () => {
    RADIUS = readRadius();
    cache = els.map((el) => {
      const r = el.getBoundingClientRect();
      return { el, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
  };

  const apply = () => {
    rafScheduled = false;
    if (reduceMotion()) return;
    const nextDirty = new Set();
    for (let i = 0; i < cache.length; i++) {
      const c = cache[i];
      const dx = c.cx - pointerX;
      const dy = c.cy - pointerY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > RADIUS) {
        if (dirty.has(c.el)) c.el.style.fontWeight = BASE_WEIGHT;
        continue;
      }
      const t = 1 - d / RADIUS;
      const eased = easeBezier(t);
      let w = Math.round(BASE_WEIGHT + (PEAK_WEIGHT - BASE_WEIGHT) * eased);
      if (w < MIN_AXIS) w = MIN_AXIS;
      else if (w > MAX_AXIS) w = MAX_AXIS;
      c.el.style.fontWeight = w;
      nextDirty.add(c.el);
    }
    dirty.clear();
    nextDirty.forEach((el) => dirty.add(el));
  };

  const schedule = () => {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(apply);
  };

  const reset = () => {
    dirty.forEach((el) => {
      el.style.fontWeight = BASE_WEIGHT;
    });
    dirty.clear();
  };

  const onMove = (e) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
    if (helper && helper.classList.contains("on")) {
      helper.style.left = pointerX + "px";
      helper.style.top = pointerY + "px";
    }
    if (!bound) return;
    if (cache.length === 0 && els.length) refresh();
    schedule();
  };

  const onResize = () => {
    if (bound) refresh();
  };

  const buildHelperGradient = () => {
    if (!helper) return;
    const STOPS = 16;
    const pos = [];
    const neg = [];
    for (let i = 0; i <= STOPS; i++) {
      const s = i / STOPS;
      const y = easeBezier(1 - s);
      const pct = (s * 100).toFixed(2) + "%";
      if (y >= 0) {
        pos.push("rgba(255,255,255," + (y * 0.55).toFixed(3) + ") " + pct);
        neg.push("rgba(0,0,0,0) " + pct);
      } else {
        pos.push("rgba(255,255,255,0) " + pct);
        neg.push("rgba(0,0,0," + Math.min(0.7, Math.abs(y) * 3).toFixed(3) + ") " + pct);
      }
    }
    helper.style.background =
      "radial-gradient(circle, " + neg.join(", ") +
      "), radial-gradient(circle, " + pos.join(", ") + ")";
  };

  const onHelperKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== "`" || !helper) return;
    helper.classList.toggle("on");
    if (helper.classList.contains("on")) {
      helper.style.left = pointerX + "px";
      helper.style.top = pointerY + "px";
    }
  };

  return {
    setHelper(el) {
      helper = el;
      buildHelperGradient();
    },
    attach(charEls) {
      els = Array.from(charEls || []);
      refresh();
    },
    refresh,
    bind() {
      if (bound) return;
      bound = true;
      RADIUS = readRadius();
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointercancel", reset);
      document.addEventListener("mouseleave", reset);
      window.addEventListener("keydown", onHelperKey);
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);
    },
    unbind() {
      bound = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointercancel", reset);
      document.removeEventListener("mouseleave", reset);
      window.removeEventListener("keydown", onHelperKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      reset();
    },
  };
}
