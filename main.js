import { PRESETS, PALETTES } from "./presets.js";

const DEFAULT_OPTIONS = {
  mode: "pixel",
  colors: ["#0a0a12", "#B19EEF", "#5227FF", "#ff00f7"],
  colorBlend: "smooth",
  colorBalance: [1, 1, 1, 1, 1, 1, 1],
  meshDetail: 16,
  foldIntensity: 4,
  foldScale: 3,
  foldSpeed: 1,
  rimLight: false,
  rimIntensity: 0.6,
  rimColor: "#B19EEF",
  rimFalloff: 1.2,
  speed: 0.4,
  direction: "auto",
  grain: 0.2,
  reactive: false,
  mouseRadius: 0.4,
  scrollReactive: false,
  field: {
    octaves: 2,
    lacunarity: 2,
    gain: 0.5,
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
  helper: false,
};

const isObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value);

const deepMerge = (base, override) => {
  if (!isObject(base)) return override;
  const result = { ...base };
  if (!isObject(override)) return result;
  Object.keys(override).forEach((key) => {
    const baseValue = result[key];
    const overrideValue = override[key];
    if (isObject(baseValue) && isObject(overrideValue)) {
      result[key] = deepMerge(baseValue, overrideValue);
    } else {
      result[key] = overrideValue;
    }
  });
  return result;
};

const safeList = (list, validator) =>
  Array.isArray(list) ? list.filter(validator) : [];

const safePresets = safeList(PRESETS, (preset) => {
  return (
    preset &&
    typeof preset.name === "string" &&
    preset.name.length > 0 &&
    preset.options &&
    typeof preset.options === "object"
  );
});

const safePalettes = safeList(PALETTES, (palette) => {
  return (
    palette &&
    typeof palette.name === "string" &&
    palette.name.length > 0 &&
    Array.isArray(palette.colors) &&
    palette.colors.length > 0
  );
});

const pickByName = (list, name) =>
  list.find((entry) => entry.name === name) || null;

const pickRandom = (list) => {
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)] || null;
};

const getFromURL = (param, list) => {
  const params = new URLSearchParams(window.location.search);
  const name = params.get(param);
  if (!name) return null;
  return pickByName(list, name);
};

const paletteToOptions = (palette) => {
  if (!palette) return {};
  return {
    colors: palette.colors,
    ...(palette.colorBlend ? { colorBlend: palette.colorBlend } : {}),
    ...(palette.colorBalance ? { colorBalance: palette.colorBalance } : {}),
  };
};

const buildOptions = (preset, palette) => {
  let merged = deepMerge(DEFAULT_OPTIONS, preset?.options || {});
  merged = deepMerge(merged, paletteToOptions(palette));
  return merged;
};

document.addEventListener("DOMContentLoaded", () => {
  let chosenPreset = getFromURL("preset", safePresets) || pickRandom(safePresets);
  let chosenPalette = getFromURL("palette", safePalettes) || pickRandom(safePalettes);

  const effect = spectraGL({
    target: "#bg",
    ...buildOptions(chosenPreset, chosenPalette),
  });

  window.__spectra = effect;
  window.__chosenPreset = chosenPreset;
  window.__chosenPalette = chosenPalette;

  if (effect) {
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (key === "r") {
        const nextPreset = pickRandom(safePresets);
        const nextPalette = pickRandom(safePalettes);
        chosenPreset = nextPreset || chosenPreset;
        chosenPalette = nextPalette || chosenPalette;
      } else if (key === "p") {
        const nextPalette = pickRandom(safePalettes);
        chosenPalette = nextPalette || chosenPalette;
      } else if (key === "o") {
        const nextPreset = pickRandom(safePresets);
        chosenPreset = nextPreset || chosenPreset;
      } else {
        return;
      }

      if (safePresets.length === 0 && safePalettes.length === 0) return;
      const nextOptions = buildOptions(chosenPreset, chosenPalette);
      effect.updateOptions(nextOptions);
      window.__chosenPreset = chosenPreset;
      window.__chosenPalette = chosenPalette;
    });
  }
});
