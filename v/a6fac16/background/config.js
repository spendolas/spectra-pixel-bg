// Background config: spectra option defaults, preset/palette catalogues and the
// option builder (moved verbatim from src/framework/shader.js, T3.4).

import { PRESETS, PALETTES } from "../presets.js";
import { isDevEnabled } from "../framework/devHost.js";

// Background engine selection (T3.6). Production always boots DEFAULT_ENGINE
// (Sombra since the flip; failure chain sombra → spectra → css → none);
// `?engine=spectra|css|mock|sombra` is honoured ONLY when isDevEnabled() (and isDevEnabled() is not even consulted
// unless the parameter is present). "mock" = the recording engine (T3.7).
export const DEFAULT_ENGINE = "sombra";
// "sombra" (Phase 4): the default since the owner flipped it (spectra stays the fallback).
export const ENGINE_IDS = ["spectra", "css", "mock", "sombra"];
export const requestedEngine = () => {
  if (typeof location === "undefined") return DEFAULT_ENGINE;
  let want = null;
  try {
    want = new URLSearchParams(location.search).get("engine");
  } catch (e) {
    return DEFAULT_ENGINE;
  }
  if (!want || !ENGINE_IDS.includes(want) || !isDevEnabled()) return DEFAULT_ENGINE;
  return want;
};

// Dev-only Sombra options (read only on the ?engine=sombra path, which is itself
// dev-only): ?scene=<registry id> picks a scene; ?sombramock=1 uses the dev mock
// player (dev/fixtures/mock-sombra.js) instead of the vendored one.
const devParam = (name) => {
  if (typeof location === "undefined") return null;
  try {
    const v = new URLSearchParams(location.search).get(name);
    return v != null && isDevEnabled() ? v : null;
  } catch (e) {
    return null;
  }
};
export const requestedScene = () => {
  const v = devParam("scene");
  return v && /^[a-z0-9][a-z0-9-]*$/.test(v) ? v : null;
};
export const useSombraMock = () => devParam("sombramock") === "1";
// ?sceneregistry=dev/fixtures/<file>.json (dev-only, T4.8): replaces the scene
// registry (assets/shaders/index.json) — e.g. a two-entry list to exercise scene
// swaps. Only paths under dev/fixtures/ (relative to src/) are accepted.
export const requestedRegistry = () => {
  const v = devParam("sceneregistry");
  return v && /^dev\/fixtures\/[a-z0-9-]+\.json$/.test(v) ? v : null;
};

export const DEFAULT_OPTIONS = {
  mode: "pixel",
  colors: ["#0a0a12", "#B19EEF", "#5227FF", "#ff00f7"],
  colorBlend: "smooth",
  colorBalance: [1, 1, 1, 1, 1, 1, 1],
  meshDetail: 16,
  foldIntensity: 8,
  foldScale: 5,
  foldSpeed: 5,
  rimLight: false,
  rimIntensity: 0.0,
  rimColor: "#B19EEF",
  rimFalloff: 0.5,
  speed: 0.1,
  direction: "up",
  grain: 0,
  reactive: false,
  mouseRadius: 0.4,
  scrollReactive: false,
  field: {
    octaves: 0.5,
    lacunarity: 2,
    gain: 0.0,
    warpStrength: 0.2,
    seed: [0, 0],
    flow: [0.02, -0.01],
    angle: 0,
    noiseType: "value",
    fractalType: "fbm",
    boxFreq: 6,
    debug: 0,
    min: 0.2,
    max: 0.8,
  },
  pixelRatio: "auto",
  maxFPS: 60,
  qualityPreset: "low",
  border: {
    enabled: false,
    width: 2,
    radiusFromElement: true,
    radius: null,
    position: "outside",
  },
  helper: 0,
};

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

const deepMerge = (base, override) => {
  if (!isObject(base)) return override;
  const result = { ...base };
  if (!isObject(override)) return result;
  Object.keys(override).forEach((key) => {
    const b = result[key];
    const o = override[key];
    result[key] = isObject(b) && isObject(o) ? deepMerge(b, o) : o;
  });
  return result;
};

const safeList = (list, validator) =>
  Array.isArray(list) ? list.filter(validator) : [];

export const safePresets = safeList(
  PRESETS,
  (p) => p && typeof p.name === "string" && p.name.length > 0 && p.options && typeof p.options === "object"
);

export const safePalettes = safeList(
  PALETTES,
  (p) =>
    p &&
    typeof p.name === "string" &&
    p.name.length > 0 &&
    Array.isArray(p.colors) &&
    p.colors.length > 0
);

export const pickRandom = (list) =>
  list.length === 0 ? null : list[Math.floor(Math.random() * list.length)] || null;

export const pickRandomExcluding = (list, exclude) => {
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  let next = exclude;
  let guard = 0;
  while (next === exclude && guard < 10) {
    next = pickRandom(list);
    guard += 1;
  }
  return next || exclude;
};

const paletteToOptions = (palette) => {
  if (!palette) return {};
  return {
    colors: palette.colors,
    ...(palette.colorBlend ? { colorBlend: palette.colorBlend } : {}),
    ...(palette.colorBalance ? { colorBalance: palette.colorBalance } : {}),
  };
};

const randomSeed = () => [
  Number((Math.random() * 200).toFixed(2)),
  Number((Math.random() * 200).toFixed(2)),
];

export const buildOptions = (preset, palette, { seed } = {}) => {
  let merged = deepMerge(DEFAULT_OPTIONS, preset?.options || {});
  merged = deepMerge(merged, paletteToOptions(palette));
  const nextSeed = Array.isArray(seed) && seed.length === 2 ? seed : randomSeed();
  merged = deepMerge(merged, { field: { seed: nextSeed } });
  return merged;
};
