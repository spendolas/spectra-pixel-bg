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
});
