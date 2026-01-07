// PRESETS: [{ name: string, options: object }]
// PALETTES: [{ name: string, colors: string[], colorBlend?: "smooth"|"sharp"|"stepped", colorBalance?: number[] }]
export const PRESETS = [
  {
    name: "Preset 1 - Value FBM",
    options: {
      foldIntensity: 1,
      foldScale: 1,
      foldSpeed: 10,
      field: {
        noiseType: "value",
        fractalType: "fbm",
      },
    },
  },
  {
    name: "Preset 2 - Simplex FBM",
    options: {
      foldIntensity: 8,
      foldScale: 1,
      foldSpeed: .5,
      grain: 0.0,
      speed: 1,
      field: {
        wiggle: 0.1,
        noiseType: "simplex",
        fractalType: "fbm",
      },
    },
  },
  {
    name: "Preset 3 - Worley Ridged",
    options: {
      foldIntensity: .1,
      foldScale: .1,
      foldSpeed: 5,
      speed: 0.00001,
      field: {
        noiseType: "worley",
        fractalType: "ridged",
      },
    },
  },
  {
    name: "Preset 4 - Box None",
    options: {
      foldIntensity: 2,
      foldScale: .5,
      foldSpeed: 0.1,
      rimIntensity: 0.0,
      rimColor: "#B19EEF",
      rimFalloff: 0.5,
      speed: 5,
      grain: 0.0,
      field: {
        octaves: 8,
        lacunarity: 2,
        gain: 10.0,
        warpStrength: 5,
        noiseType: "box",
        fractalType: "none",
        boxFreq: 201,
     },
    },
  },
];

export const PALETTES = [
//   {
//     name: "Spectra Original",
//     colors: ["#0a0a12", "#B19EEF", "#5227FF", "#ff00f7"],
//   },
  {
    name: "Cobalt Drift",
    colors: ["#05070d", "#233b6a", "#3c6fff", "#8cc6ff", "#a9bad6"],
  },
  {
    name: "Violet Ember",
    colors: ["#0a0710", "#2a0f3b", "#6a1fd1", "#ff6ad5", "#f4b9e1"],
  },
  {
    name: "Teal Afterglow",
    colors: ["#04080a", "#0f2f3a", "#1c9fa6", "#69c0b3", "#d4ede1"],
  },
  {
    name: "Solar Ember",
    colors: ["#100605", "#3b0f0a", "#88271a", "#bd5c24", "#ffd18a"],
  },
  {
    name: "Citrus Pulse",
    colors: ["#0f0705", "#3a1e0c", "#7a3f16", "#9c521d", "#d6a05c"],
  },
  {
    name: "Rose Heat",
    colors: ["#120507", "#3b0a18", "#a3173f", "#ff4b6e", "#ffc0c8"],
  },
];
