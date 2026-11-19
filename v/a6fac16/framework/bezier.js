// CSS-style cubic-bezier evaluator (Newton + bisection). Returns f(x) -> y.
// Used by the Hero cursor-weight spatial falloff. Lifted verbatim.
export const makeBezier = (x1, y1, x2, y2) => {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = sampleX(t) - x;
      if (Math.abs(dx) < 1e-5) return sampleY(t);
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= dx / d;
    }
    let lo = 0,
      hi = 1;
    t = x;
    while (lo < hi) {
      const cur = sampleX(t);
      if (Math.abs(cur - x) < 1e-5) return sampleY(t);
      if (cur < x) lo = t;
      else hi = t;
      const next = (lo + hi) / 2;
      if (next === t) break;
      t = next;
    }
    return sampleY(t);
  };
};
