// Yard shader wash: the module's "surface" is the shader itself, washed toward
// grayscale via a derived treatment — the rolled palette keeps driving the field
// structure and the UI tokens (keepTokens), while the visible colors tween to
// washPalette(base).
//
// createWash() → { treatment, getWash(), setWash({presence, chroma, target}) }

import { washPalette } from "../../framework/color.js";
import { TIMINGS } from "../../framework/timings.js";

// Wash presence RANGE [dark, light]: per-stop wash strength interpolated across
// the palette's luminance (see washPalette). Dark and light ends tuned
// independently so you can keep the dark bg dark while lifting the light stops.
// Lower = brighter (more lift toward target). Dev hosts can override these live
// (?wash= / the ?washui panel) — see src/dev/yardParams.js.
export const DEFAULT_PRESENCE = [0.16, 0.12];

// Chroma: 0 = pure grayscale wash (original look), 1 = keep full colour before
// lifting. Target: the hex the wash lifts toward. Dev overrides: ?chroma= /
// ?washtarget= (src/dev/yardParams.js).
export const DEFAULT_CHROMA = 0;
export const DEFAULT_TARGET = "#d9d9d9";

export function createWash() {
  // Live-tunable wash dials (seeded from the module defaults). The dev wash
  // panel / URL params (src/dev/) mutate these through yardApi; treatment.derive
  // reads them, so both live tweaks and rerolls use the current combo. Bake the
  // winning values back into the DEFAULT_* constants once found.
  let washPresence = DEFAULT_PRESENCE.slice(); // [dark, light]
  let washChroma = DEFAULT_CHROMA;
  let washTarget = DEFAULT_TARGET;

  // The wash tween staggers its stops by luminance (see shader tweenColors):
  // when the palette brightens the brightest colour leads; when it darkens the
  // darkest leads (shader.js is the authority on the direction).
  // Direction is derived from the transition itself, so nothing to set here.
  const treatment = {
    derive: (colors) => washPalette(colors, washPresence, { target: washTarget, chroma: washChroma }),
    // field colour-wash duration (own knob, split from moduleDur). A getter so a
    // live TIMINGS.washMs edit (timeline panel) is honoured on the next transition.
    get tweenMs() { return TIMINGS.washMs; },
    keepTokens: true, // UI tokens stay pinned to the rolled palette
  };

  return {
    treatment,
    getWash: () => ({ presence: washPresence.slice(), chroma: washChroma, target: washTarget }),
    // Any subset of {presence: [dark, light], chroma, target}. Presence is
    // written in place (treatment.derive closes over the same array).
    setWash: ({ presence, chroma, target } = {}) => {
      if (presence) {
        washPresence[0] = presence[0];
        washPresence[1] = presence[1];
      }
      if (chroma != null) washChroma = chroma;
      if (target != null) washTarget = target;
    },
  };
}
