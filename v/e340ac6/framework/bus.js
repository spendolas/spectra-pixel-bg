// Tiny shared UI state. `capture` is set by a module that owns keyboard input
// (e.g. Video's password field) so global key handlers (shader reroll, deck
// Space-to-advance) stand down while typing. Arrow/Page nav still works.
// `persist` is set by the deck during a transition: a Set of .reveal-inner
// elements that are IDENTICAL in both modules (same text, same box — e.g. the
// Hero↔Yard furniture) and therefore skip exit/enter (anim.js filters them);
// the deck color-tweens the outgoing one and swaps at the end instead.
// `trans` holds the ACTIVE transition's per-clip start-offsets (leads), set by
// the deck each move so anim.js/yard.js time their clips independently per
// transition. Shape: { textIn, anchorIn, textOut, cascadeIn, cascadeOut, hairline }.
export const ui = { capture: false, persist: null, trans: null };
