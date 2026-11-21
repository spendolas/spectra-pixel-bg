// Sombra scene profiles (T4.2, PLAN §5.3). A profile binds the site's roles
// (palette stops, field alpha, balance, seed, time, extra params) to knobs of one
// exported Sombra scene (.ombra). Capabilities are DERIVED from which bindings
// resolve against the live scene — never authored.
//
// Pure module: no DOM at import (importable in Node for the validator / tests).
// The schema is documented in docs/refactor/sombra/profile.schema.json.

export const PROFILE_SCHEMA = 1;
const ROLE_SINGLE = ["fieldAlpha", "balance", "time"];
const ROLE_MULTI = ["palette", "seed"];

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const isAddr = (b) => isObj(b) && typeof b.nodeId === "string" && typeof b.param === "string" && typeof b.key === "string";

/**
 * Structural validation (no scene needed).
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateProfile(p) {
  const errors = [];
  if (!isObj(p)) return { ok: false, errors: ["profile is not an object"] };
  if (p.schema !== PROFILE_SCHEMA) errors.push(`schema must be ${PROFILE_SCHEMA} (got ${JSON.stringify(p.schema)})`);
  if (typeof p.id !== "string" || !p.id) errors.push("id must be a non-empty string");
  if (typeof p.scene !== "string" || !/\.ombra$/.test(p.scene)) errors.push("scene must be a .ombra file name");
  if (p.sceneSha256 != null && !/^[0-9a-f]{64}$/.test(p.sceneSha256)) errors.push("sceneSha256 must be 64 hex digits");
  const b = p.bindings;
  if (!isObj(b)) {
    errors.push("bindings must be an object");
    return { ok: false, errors };
  }
  for (const k of Object.keys(b)) if (!ROLE_SINGLE.includes(k) && !ROLE_MULTI.includes(k)) errors.push(`bindings.${k}: unknown role`);
  if (!Array.isArray(b.palette) || b.palette.length < 2) errors.push("bindings.palette must list at least 2 stops");
  else b.palette.forEach((s, i) => { if (!isAddr(s)) errors.push(`bindings.palette[${i}] needs nodeId, param, key`); });
  if (b.seed != null) {
    if (!Array.isArray(b.seed)) errors.push("bindings.seed must be an array");
    else b.seed.forEach((s, i) => { if (!isAddr(s)) errors.push(`bindings.seed[${i}] needs nodeId, param, key`); });
  }
  for (const r of ROLE_SINGLE) if (b[r] != null && !isAddr(b[r])) errors.push(`bindings.${r} needs nodeId, param, key (or null)`);
  if (b.balance && b.balance.map != null) {
    const m = b.balance.map;
    const pts = (a) => Array.isArray(a) && a.length >= 2 && a.every(Number.isFinite);
    const ascending = (a) => a.every((v, i) => i === 0 || v > a[i - 1]);
    if (!isObj(m) || !pts(m.site) || !pts(m.knob) || m.site.length !== m.knob.length || !ascending(m.site))
      errors.push("bindings.balance.map must be {site:[…], knob:[…]}: equal-length (≥ 2) number arrays, site strictly ascending");
  }
  if (p.params != null) {
    if (!isObj(p.params)) errors.push("params must be an object");
    else
      for (const [n, a] of Object.entries(p.params)) {
        if (!isAddr(a)) errors.push(`params.${n} needs nodeId, param, key`);
        else if (a.devicePx != null && !(a.devicePx > 0)) errors.push(`params.${n}.devicePx must be a number > 0`);
        else if (a.viewport != null) {
          const v = a.viewport;
          if (!isObj(v) || (v.axis !== "height" && v.axis !== "width") || !(v.divisor > 0) || (v.multiplier != null && !Number.isFinite(v.multiplier)))
            errors.push(`params.${n}.viewport must be {axis:"height"|"width", divisor:>0, multiplier?:number}`);
        }
      }
  }
  if (p.defaults != null && !isObj(p.defaults)) errors.push("defaults must be an object");
  return { ok: errors.length === 0, errors };
}

/** Fetch + validate. Throws with every error listed. */
export async function loadProfile(url, fetchImpl = typeof fetch === "function" ? fetch : null) {
  if (!fetchImpl) throw new Error("loadProfile: no fetch");
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`loadProfile: ${url} HTTP ${res.status}`);
  const p = await res.json();
  const v = validateProfile(p);
  if (!v.ok) throw new Error(`loadProfile: ${url} invalid: ${v.errors.join("; ")}`);
  return p;
}

// Knob descriptors from handle.nodes() ([{id, params:[descriptor]}]) or a flat
// manifest / handle.variables() list ([descriptor]).
const flatten = (nodesOrManifest) => {
  const list = Array.isArray(nodesOrManifest) ? nodesOrManifest : [];
  return list.flatMap((n) => (Array.isArray(n && n.params) ? n.params.map((p) => ({ ...p, nodeId: p.nodeId || n.id })) : [n]));
};

const TYPE = { palette: "color", fieldAlpha: "float", balance: "float", seed: "float", time: "float" };

/**
 * Resolve a profile against the live scene's knobs.
 * @returns {{bindings:object, params:object, caps:object, warnings:string[]}}
 *   bindings.<role> = {nodeId, param, key, type, …} (or [] / null when off).
 * @throws when a palette stop does not resolve (the scene cannot be driven).
 * Optional roles that do not resolve are switched off (warning) — the cap goes false.
 */
export function resolveBindings(profile, nodesOrManifest) {
  const knobs = flatten(nodesOrManifest);
  const byAddr = new Map(knobs.map((k) => [`${k.nodeId} ${k.param}`, k]));
  const warnings = [];
  const resolve = (role, b) => {
    const k = byAddr.get(`${b.nodeId} ${b.param}`);
    if (!k) return { err: `${role}: no knob ${b.nodeId}.${b.param}` };
    const want = TYPE[role];
    if (want && k.type !== want) return { err: `${role}: knob ${k.key} is ${k.type}, expected ${want}` };
    if (b.key && k.key !== b.key) warnings.push(`${role}: key ${b.key} is now ${k.key} (run --stamp)`);
    return { k: { ...b, key: k.key, type: k.type, glslType: k.glslType, min: k.min, max: k.max, default: k.default } };
  };
  const B = profile.bindings || {};
  const palette = (B.palette || []).map((b, i) => {
    const r = resolve("palette", b);
    if (r.err) throw new Error(`resolveBindings: palette stop ${i}: ${r.err}`);
    return r.k;
  });
  const single = (role) => {
    if (!B[role]) return null;
    const r = resolve(role, B[role]);
    if (r.err) { warnings.push(`${r.err} — ${role} off`); return null; }
    return r.k;
  };
  const seed = (B.seed || []).map((b) => resolve("seed", b)).filter((r) => (r.err ? (warnings.push(`${r.err} — seed knob skipped`), false) : true)).map((r) => r.k);
  const bindings = { palette, fieldAlpha: single("fieldAlpha"), balance: single("balance"), seed, time: single("time") };
  const params = {};
  for (const [n, b] of Object.entries(profile.params || {})) {
    const k = byAddr.get(`${b.nodeId} ${b.param}`);
    if (k) params[n] = { ...b, key: k.key, type: k.type, min: k.min, max: k.max, default: k.default }; // b.viewport (if any) carries through
    else warnings.push(`params.${n}: no knob ${b.nodeId}.${b.param} — skipped`);
  }
  const caps = {
    stops: palette.length,
    slots: palette.length,
    perStopAlpha: palette.length > 0 && palette.every((k) => k.type === "color"),
    fieldAlpha: !!bindings.fieldAlpha,
    balance: !!bindings.balance,
    seed: bindings.seed.length > 0,
    freeze: true,
    gpu: true,
    clock: bindings.time ? "host" : "wall",
  };
  return { bindings, params, caps, warnings };
}

/**
 * Value of a viewport-derived param (params.<n>.viewport): multiplier × axis size in
 * CSS px / divisor. site-worley-ridged: warp scale = H / 51.2, colour warp = 2× that.
 */
export const viewportValue = (param, size) => (Number.isFinite(param.viewport.multiplier) ? param.viewport.multiplier : 1) * (size[param.viewport.axis === "width" ? 0 : 1] / param.viewport.divisor);

/**
 * Site→knob balance map: piecewise linear through the profile's points
 * (map.site ascending ↔ map.knob), extrapolating past both ends with the end
 * segments' slopes. Identity when the binding has no map.
 */
export const mapBalance = (binding, v) => {
  const m = binding && binding.map;
  if (!m) return v;
  const S = m.site;
  const K = m.knob;
  const n = S.length;
  let i = 0;
  if (v >= S[n - 1]) i = n - 2;
  else while (i < n - 2 && v > S[i + 1]) i++;
  return K[i] + ((v - S[i]) / (S[i + 1] - S[i])) * (K[i + 1] - K[i]);
};

/**
 * Site seed [x, y] (two numbers in [0, 200), 2 dp) → float32-safe Sombra seed in
 * [1, 99), 0.001 steps; knob i of a multi-knob binding gets its own offset (PLAN T4.5).
 */
export const packSeed = ([x, y], i = 0) => {
  const u = (Math.round(x * 100) * 20000 + Math.round(y * 100)) >>> 0;
  let h = Math.imul(u ^ (u >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return 1 + ((h + i * 40503) % 98000) / 1000;
};
