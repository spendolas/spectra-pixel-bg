import { PRESETS } from "./presets.js";

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

const safePresets = Array.isArray(PRESETS)
  ? PRESETS.filter(
      (preset) =>
        preset &&
        typeof preset.name === "string" &&
        preset.name.length > 0 &&
        preset.options &&
        typeof preset.options === "object",
    )
  : [];

const pickPresetByName = (name) =>
  safePresets.find((preset) => preset.name === name) || null;

const pickRandomPreset = () => {
  if (safePresets.length === 0) return null;
  const index = Math.floor(Math.random() * safePresets.length);
  return safePresets[index] || null;
};

const getPresetFromURL = () => {
  const params = new URLSearchParams(window.location.search);
  const name = params.get("preset");
  if (!name) return null;
  return pickPresetByName(name);
};

document.addEventListener("DOMContentLoaded", () => {
  const presetFromUrl = getPresetFromURL();
  const selectedPreset = presetFromUrl || pickRandomPreset();
  const selectedOptions = selectedPreset ? selectedPreset.options : DEFAULT_OPTIONS;

  const effect = spectraGL({
    target: "#bg",
    ...selectedOptions,
  });

  window.__spectra = effect;
  window.__preset = selectedPreset;

  if (effect && safePresets.length > 0) {
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (key === "r") {
        const nextPreset = pickRandomPreset();
        if (nextPreset) {
          window.__preset = nextPreset;
          effect.updateOptions(nextPreset.options);
        }
      }
    });
  }
});
