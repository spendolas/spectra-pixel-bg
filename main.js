document.addEventListener("DOMContentLoaded", () => {
  const params = {
    target: "#bg",
    mode: "pixel",
    qualityPreset: "balanced",
    meshDetail: 24,
    foldScale: 2.2,
    foldIntensity: 0.65,
    foldSpeed: 0.35,
    speed: 0.6,
    grain: 0.12,
    colorBlend: "stepped",
    colors: ["#0a0a12", "#1d1736", "#5b4bff", "#f4e8ff"],
    reactive: false,
  };

  const effect = spectraGL(params);

  window.__spectra = effect;
});
