document.addEventListener("DOMContentLoaded", () => {
  const params = {
    target: "#bg",
    mode: "pixel",
    colors: ["#0a0a12", "#B19EEF", "#5227FF", "#ff00f7"],
    colorBlend: "smooth",
    colorBalance: [1, 1, 1, 1, 1, 1, 1],
    meshDetail: 16,
    foldIntensity: 5,
    foldScale: 5,
    foldSpeed: 2,
    rimLight: false,
    rimIntensity: 1,
    rimColor: "#B19EEF",
    rimFalloff: 0.7,
    speed: 0.2,
    direction: "up",
    grain: 0.3,
    reactive: false,
    reactiveStrength: 0.8,
    displacementStrength: 0.3,
    mouseRadius: 0.4,
    scrollReactive: false,
    scrollStrength: 0.6,
    field: {
      octaves: 2,
      lacunarity: 1.3,
      gain: 0.5,
      warpStrength: 0.35,
      seed: [12.3, 4.7],
      flow: [0.03, -0.01],
      angle: 0.2,
      noiseType: "value",
      fractalType: "fbm",
      boxFreq: 6,
      debug: 0,
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

  const effect = spectraGL(params);

  window.__spectra = effect;

  if (effect) {
    const presets = {
      "1": { noiseType: "value", fractalType: "fbm" },
      "2": { noiseType: "simplex", fractalType: "fbm" },
      "3": { noiseType: "worley", fractalType: "ridged" },
      "4": { noiseType: "box", fractalType: "none", boxFreq: 6 },
    };
    let debug = params.field.debug || 0;

    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (presets[key]) {
        effect.updateOptions({ field: presets[key] });
        return;
      }
      if (key === "d") {
        debug = (debug + 1) % 4;
        effect.updateOptions({ field: { debug } });
      }
    });
  }
});
