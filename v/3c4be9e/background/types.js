// JSDoc typedefs for the background layer (PLAN §4 Phase 3). No runtime code.

/**
 * @typedef {Object} EngineCaps
 * @property {number} stops           colour stops the field blends (spectra pixel: 4)
 * @property {number} slots           per-stop alpha array length the engine expects (spectra: 7)
 * @property {boolean} perStopAlpha   setStopAlpha honoured (else the director fades `el`)
 * @property {boolean} balance        setBalance honoured
 * @property {boolean} seed           setScene({seed}) re-seeds without remount
 * @property {boolean} freeze         true clock freeze (resume on the same frame)
 * @property {boolean} gpu            false for the CSS fallback
 * @property {"engine"|"host"|"wall"} clock
 *
 * @typedef {Object} BackgroundEngine  instant, idempotent setters; NO tweening, NO tokens, NO keys
 * @property {string} id
 * @property {EngineCaps} caps
 * @property {string[]} scenes          ids selectable through setScene; spectra: preset names
 * @property {Promise<boolean>} ready   true = first frame drawn; false = failed/timeout. Never rejects.
 * @property {HTMLElement|null} el      the engine's body-level surface
 * @property {(scene:object, colors?:string[]) => void} setScene
 *   spectra: `scene` is a full option set (buildOptions); `colors` overrides its palette in the same payload
 * @property {(hex:string[]) => void} setPalette
 * @property {(a:number[]) => void} setStopAlpha
 * @property {(v:number) => void} setBalance        site units: ≤ −1.0 empty, ≥ +0.985 full
 * @property {(playing:boolean) => void} setPlaying
 * @property {() => void} destroy                   releases its GL context and removes el
 * @property {(type:"contextlost"|"contextrestored"|"error", fn:Function) => () => void} on
 *
 * @typedef {Object} DebugState
 * @property {string[]} palette
 * @property {number[]} alphas
 * @property {number} balance
 * @property {[number, number]} seed
 * @property {string|null} preset
 * @property {boolean} frozen
 * @property {{dissolve:boolean, balance:boolean, colors:boolean}} tweens   in flight
 */

export {};
