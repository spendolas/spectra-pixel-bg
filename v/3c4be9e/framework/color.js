// Color helpers — derive runtime color tokens from the active shader palette.
// See DESIGN.md §3.

export const parseHex = (hex) => {
  if (typeof hex !== "string") return null;
  let s = hex.trim().replace(/^#/, "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
};

const luminance = (rgb) => 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];

// Perceptual luminance (0..255) of a hex string (#rrggbb or #rgb). Unparseable
// input reads as 0. Used to rank palette stops for the tween stagger.
export const lumOf = (hex) => {
  const rgb = parseHex(hex);
  return rgb ? luminance(rgb) : 0;
};

// sRGB per-channel hex interpolation (matches how the shader receives colors —
// three r128 uploads hex values raw, no color management). Accepts #rrggbb and
// #rgb; always returns lowercase #rrggbb. If one end is unparseable the other
// end is returned unchanged.
export const lerpHex = (a, b, t) => {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa) return b;
  if (!pb) return a;
  let out = "#";
  for (let i = 0; i < 3; i++) {
    const ca = pa[i];
    const cb = pb[i];
    out += Math.round(ca + (cb - ca) * t)
      .toString(16)
      .padStart(2, "0");
  }
  return out;
};

export const darkestHex = (colors) => {
  const fallback = "#0a0a12";
  if (!Array.isArray(colors)) return fallback;
  let bestHex = null;
  let bestLum = Infinity;
  colors.forEach((hex) => {
    const rgb = parseHex(hex);
    if (!rgb) return;
    const lum = luminance(rgb);
    if (lum < bestLum) {
      bestLum = lum;
      bestHex = hex;
    }
  });
  return bestHex || fallback;
};

export const brightestHex = (colors) => {
  if (!Array.isArray(colors)) return "#FFFFFF";
  let bestHex = null;
  let bestLum = -Infinity;
  colors.forEach((hex) => {
    const rgb = parseHex(hex);
    if (!rgb) return;
    const lum = luminance(rgb);
    if (lum > bestLum) {
      bestLum = lum;
      bestHex = hex;
    }
  });
  return bestHex || "#FFFFFF";
};

export const mixWithWhite = (hex, whiteAlpha) => {
  const rgb = parseHex(hex);
  if (!rgb) return "#FFFFFF";
  const a = Math.max(0, Math.min(1, whiteAlpha));
  const mix = (c) => Math.round(a * 255 + (1 - a) * c);
  const hx = (n) => n.toString(16).padStart(2, "0").toUpperCase();
  return "#" + hx(mix(rgb[0])) + hx(mix(rgb[1])) + hx(mix(rgb[2]));
};

// Tinted white: composite the palette's mid color (index 2) under 90% pure
// white. Index 2 reads more present in the shader than the brighter accent.
export const tintedWhite = (colors) => {
  const source = (Array.isArray(colors) && colors[2]) || brightestHex(colors);
  return mixWithWhite(source, 0.9);
};

// Yard wash — the dynamic light-mode palette, derived from whatever palette is
// rolled. Preserves the dark→light structure driving the pixel shader while
// lifting the colours toward a TARGET. Dials:
//   presence — how much of the palette's own contrast survives the wash
//              (1 = full colour/luminance, 0 = flat on the target). May be a
//              SCALAR (uniform) or a [dark, light] RANGE, interpolated per stop
//              across the palette's luminance span — so the darkest stop washes
//              by the first value and the lightest by the second. A range
//              decouples the ends (keep the dark bg dark while lifting the light
//              stops toward the target) — a spread one scalar can't produce.
//   chroma   — how much of each colour's chroma is kept before lifting
//              (0 = pure grayscale luminance, 1 = full original colour).
//   target   — the hex the wash lifts toward (default pure white).
// Per channel: c = lum + (rgb - lum)*chroma       // grayscale → colour
//              out = target + (c - target)*p       // p = this stop's presence
// Defaults (scalar presence, chroma 0, target #fff) reproduce the original wash.
export const washPalette = (colors, presence = 0.3, opts = {}) => {
  if (!Array.isArray(colors)) return colors;
  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const chroma = opts.chroma == null ? 0 : clamp01(opts.chroma);
  const tgt = parseHex(opts.target || "#ffffff") || [255, 255, 255];
  const hx = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  const range = Array.isArray(presence) ? presence : [presence, presence];
  const pDark = range[0] == null ? 0 : range[0];
  const pLight = range[1] == null ? pDark : range[1];
  const lums = colors.map((c) => { const r = parseHex(c); return r ? luminance(r) : null; });
  const valid = lums.filter((l) => l != null);
  const lo = valid.length ? Math.min(...valid) : 0;
  const span = (valid.length ? Math.max(...valid) : 0) - lo || 1;
  return colors.map((hex, idx) => {
    const rgb = parseHex(hex);
    if (!rgb) return hex;
    const lum = lums[idx];
    const p = pDark + (pLight - pDark) * ((lum - lo) / span); // dark end → light end
    const out = rgb.map((c, i) => {
      const chromaed = lum + (c - lum) * chroma; // grayscale → colour
      return tgt[i] + (chromaed - tgt[i]) * p; // lift toward target
    });
    return "#" + hx(out[0]) + hx(out[1]) + hx(out[2]);
  });
};
