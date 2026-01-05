document.addEventListener("DOMContentLoaded", () => {
  const effect = spectraGL({
    target: "#bg",
    mode: "pixel",
    qualityPreset: "balanced",
    colors: ["#0a0a12", "#B19EEF", "#5227FF", "#ff00f7"],
    reactive: false,
  });

  window.__spectra = effect;
});
