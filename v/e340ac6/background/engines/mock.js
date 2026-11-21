// Mock BackgroundEngine (T3.7): paints nothing, records every call. Dev-only,
// selected with ?engine=mock on a dev-enabled host (config.requestedEngine).
// Each call is appended to window.__bgLog as {t, method, args} (t =
// performance.now(); args deep-copied), which the harness turns into the
// `engine-ledger` baseline (see docs/refactor/sombra/CONTRACT.md).

// Caps: everything honoured. stops:4 like spectra pixel mode; slots:7 so the
// director's per-stop alpha arrays have spectra's shape (ledgers stay comparable).
export const MOCK_CAPS = Object.freeze({
  stops: 4, slots: 7, perStopAlpha: true, fieldAlpha: true, balance: true, seed: true, freeze: true, gpu: true, clock: "engine",
});

const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** @returns {import("../types.js").BackgroundEngine} */
export function createMockEngine() {
  const log = (typeof window !== "undefined" && (window.__bgLog = window.__bgLog || [])) || [];
  const rec = (method, args) => {
    log.push({ t: typeof performance !== "undefined" ? performance.now() : Date.now(), method, args: args.map(copy) });
  };
  const listeners = [];
  return {
    id: "mock",
    caps: MOCK_CAPS,
    scenes: ["a", "b"],
    ready: Promise.resolve(true),
    el: null, // paints nothing
    writable: true, // internal: the option setters run
    setScene(scene, colors) {
      rec("setScene", colors !== undefined ? [scene, colors] : [scene]);
    },
    setPalette(hex) {
      rec("setPalette", [hex]);
    },
    setStopAlpha(a) {
      rec("setStopAlpha", [a]);
    },
    setBalance(v) {
      rec("setBalance", [v]);
    },
    setOptions(o) {
      rec("setOptions", [o]);
    },
    setPlaying(playing) {
      rec("setPlaying", [playing]);
    },
    on(type, fn) {
      rec("on", [type]);
      if (!["contextlost", "contextrestored", "error"].includes(type) || typeof fn !== "function") return () => {};
      listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    destroy() {
      rec("destroy", []);
      listeners.length = 0;
    },
  };
}
