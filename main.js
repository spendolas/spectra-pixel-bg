import { PRESETS, PALETTES } from "./presets.js";

const DEFAULT_OPTIONS = {
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
  speed: .1,
  direction: "up",
  grain: 0,
  reactive: false,
  mouseRadius: 0.4,
  scrollReactive: false,
  field: {
    octaves: .5,
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

const pickRandomExcluding = (list, exclude) => {
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

const buildOptions = (preset, palette, { seed } = {}) => {
  let merged = deepMerge(DEFAULT_OPTIONS, preset?.options || {});
  merged = deepMerge(merged, paletteToOptions(palette));
  const nextSeed = Array.isArray(seed) && seed.length === 2 ? seed : randomSeed();
  merged = deepMerge(merged, { field: { seed: nextSeed } });
  return merged;
};

const parseHex = (hex) => {
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

const darkestHex = (colors) => {
  const fallback = "#0a0a12";
  if (!Array.isArray(colors)) return fallback;
  let bestHex = null;
  let bestLum = Infinity;
  colors.forEach((hex) => {
    const rgb = parseHex(hex);
    if (!rgb) return;
    const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    if (lum < bestLum) {
      bestLum = lum;
      bestHex = hex;
    }
  });
  return bestHex || fallback;
};

document.addEventListener("DOMContentLoaded", () => {
  let chosenPreset = pickRandom(safePresets);
  let chosenPalette = pickRandom(safePalettes);

  const initialOpts = buildOptions(chosenPreset, chosenPalette);
  document.body.style.backgroundColor = darkestHex(initialOpts.colors);

  const effect = spectraGL({
    target: "#bg",
    ...initialOpts,
  });

  const fadeInCanvas = (attempt = 0) => {
    const canvas = document.querySelector("canvas");
    if (!canvas) {
      if (attempt < 60) requestAnimationFrame(() => fadeInCanvas(attempt + 1));
      return;
    }
    canvas.style.opacity = "0";
    canvas.style.transition = "opacity 800ms ease";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        canvas.style.opacity = "1";
      });
    });
  };
  fadeInCanvas();

  window.__spectra = effect;
  window.__chosenPreset = chosenPreset;
  window.__chosenPalette = chosenPalette;

  if (effect) {
    let showPresetLabel = false;
    const presetLabel = document.createElement("div");
    presetLabel.style.position = "fixed";
    presetLabel.style.inset = "0";
    presetLabel.style.zIndex = "999999";
    presetLabel.style.display = "flex";
    presetLabel.style.alignItems = "center";
    presetLabel.style.justifyContent = "center";
    presetLabel.style.fontSize = "clamp(48px, 12vw, 180px)";
    presetLabel.style.fontWeight = "700";
    presetLabel.style.letterSpacing = "0.02em";
    presetLabel.style.textTransform = "uppercase";
    presetLabel.style.color = "#ffffff";
    // presetLabel.style.mixBlendMode = "exclusion";
    presetLabel.style.pointerEvents = "none";
    presetLabel.style.opacity = "0";
    presetLabel.style.transition = "opacity 120ms ease";
    presetLabel.textContent = chosenPreset?.name || "Default";
    document.body.appendChild(presetLabel);

    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      const currentSeed = Array.isArray(effect.options?.field?.seed)
        ? effect.options.field.seed
        : DEFAULT_OPTIONS.field.seed;

      if (key === "r") {
        const nextPreset = pickRandomExcluding(safePresets, chosenPreset);
        const nextPalette = pickRandomExcluding(safePalettes, chosenPalette);
        chosenPreset = nextPreset || chosenPreset;
        chosenPalette = nextPalette || chosenPalette;
      } else if (key === "p") {
        const nextPalette = pickRandomExcluding(safePalettes, chosenPalette);
        chosenPalette = nextPalette || chosenPalette;
      } else if (key === "o") {
        const nextPreset = pickRandomExcluding(safePresets, chosenPreset);
        chosenPreset = nextPreset || chosenPreset;
      } else {
        return;
      }

      if (safePresets.length === 0 && safePalettes.length === 0) return;
      const nextOptions =
        key === "p"
          ? buildOptions(chosenPreset, chosenPalette, { seed: currentSeed })
          : buildOptions(chosenPreset, chosenPalette);
      effect.updateOptions(nextOptions);
      document.body.style.backgroundColor = darkestHex(nextOptions.colors);
      window.__chosenPreset = chosenPreset;
      window.__chosenPalette = chosenPalette;
      presetLabel.textContent = chosenPreset?.name || "Default";
    });
  }
});
