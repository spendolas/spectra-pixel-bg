// Single source of truth for the site's DESIGN/UX timings (ms unless noted).
// Every module reads these LIVE at trigger time, so the localhost timeline panel
// (timelinePanel.js) can retune anything without a reload. The panel never ships
// (localhost-gated + excluded from release.sh); this config file DOES ship — it's
// just the numbers. NOTHING here is a magic literal in a module anymore.
//
// Deliberately NOT here (left in code): MSE media-time seek offsets + dead-tick
// counts in video.js (video-pipeline correctness, not design timing), and CSS
// transition/animation durations in index.html (need CSS-var plumbing — separate).
//
// PER-TRANSITION leads live in TRANSITIONS (below). The legacy flat keys
// (hyTextIn, revealLead, …) stay on TIMINGS, at their original positions, as
// enumerable accessors onto TRANSITIONS cells (see LEGACY_KEYS): get reads the
// first cell, set writes every cell. Reads, writes, Object.assign and
// JSON.stringify of TIMINGS behave exactly as before.
//
// Must stay importable in plain Node: no DOM access at import time.

// ── Per-transition table ─────────────────────────────────────────────────
// Row lookup: "<fromId>>"<toId>", or "@boot" for the first-load entrance.
// Resolution = "*" ← row ← row.mobile (mobile only); shader merged field-wise.
// shader.timer: true  → dissolve/balance scheduled through setTimeout even at 0
//               false → called synchronously.
export const TRANSITIONS = {
  "*":          { textIn:0, anchorIn:0, textOut:0, cascadeIn:350, cascadeOut:0, hairline:0, wash:0, brand:0, unwash:382,
                  shader:{ dissolve:0, balance:0, reverse:false, timer:false } },
  "@boot":      { textIn:0, anchorIn:0 },
  "hero>yard":  { textIn:367, anchorIn:0, cascadeIn:320, wash:0, brand:0, textOut:0, hairline:650 },
  "yard>hero":  { textIn:556, anchorIn:0, textOut:0, cascadeOut:128, brand:0, hairline:243, mobile:{ textOut:0 } },
  "yard>video": { textOut:575, cascadeOut:0, hairline:330, mobile:{ textOut:140 },
                  shader:{ dissolve:470, balance:300, reverse:false, timer:true } },
  "video>yard": { textIn:1160, anchorIn:0, cascadeIn:755, hairline:960,
                  shader:{ dissolve:0, balance:0, reverse:true, timer:true } },
  // Home/End jumps. Text/cascade leads fall back to "*" (untuned today), but the SHADER path is the
  // same as Yard<->Video (shipped behaviour, preserved exactly by these rows; deck.js reads it from here):
  "hero>video": { shader:{ dissolve:470, balance:300, reverse:false, timer:true } },
  "video>hero": { shader:{ dissolve:0, balance:0, reverse:true, timer:true } },
};

// Legacy flat key → LIST of [row, dotted field] cells. get = first cell, set = all.
export const LEGACY_KEYS = {
  // hero→yard
  hyTextIn: [["hero>yard", "textIn"]],
  hyAnchorIn: [["hero>yard", "anchorIn"]],
  hyCascadeIn: [["hero>yard", "cascadeIn"]],
  hyWash: [["hero>yard", "wash"]],
  hyBrand: [["hero>yard", "brand"]],
  hyTextOut: [["hero>yard", "textOut"]],
  hyHairline: [["hero>yard", "hairline"]],
  // yard→hero
  yhTextIn: [["yard>hero", "textIn"]],
  yhAnchorIn: [["yard>hero", "anchorIn"]],
  yhTextOut: [["yard>hero", "textOut"]],
  yhCascadeOut: [["yard>hero", "cascadeOut"]],
  yhBrand: [["yard>hero", "brand"]],
  yhHairline: [["yard>hero", "hairline"]],
  yhTextOutM: [["yard>hero", "mobile.textOut"]],
  // yard→video
  yvTextOut: [["yard>video", "textOut"]],
  yvCascadeOut: [["yard>video", "cascadeOut"]],
  yvHairline: [["yard>video", "hairline"]],
  yvTextOutM: [["yard>video", "mobile.textOut"]],
  // video→yard
  vyTextIn: [["video>yard", "textIn"]],
  vyAnchorIn: [["video>yard", "anchorIn"]],
  vyCascadeIn: [["video>yard", "cascadeIn"]],
  vyHairline: [["video>yard", "hairline"]],
  // first load
  hrTextIn: [["@boot", "textIn"]],
  hrAnchorIn: [["@boot", "anchorIn"]],
  // shader leads — shared by Yard↔Video and the Home/End Hero↔Video jumps
  revealLead: [["yard>video", "shader.dissolve"], ["hero>video", "shader.dissolve"]],
  balanceLead: [["yard>video", "shader.balance"], ["hero>video", "shader.balance"]],
  returnLead: [["video>yard", "shader.dissolve"], ["video>hero", "shader.dissolve"]],
  vyBalance: [["video>yard", "shader.balance"], ["video>hero", "shader.balance"]],
  // unwash delay (treatment-less, unpaused target)
  unwashDelayMs: [["*", "unwash"]],
};

// Marks a TIMINGS slot whose value lives in TRANSITIONS (accessor installed below).
// Keeping the slot in the literal preserves the key order of Object.keys / JSON.stringify.
const SHIM = Symbol("legacy-shim");

export const TIMINGS = {
  // ── Yard↔Video reveal ──────────────────────────────────────────────
  revealLead: SHIM, // logos depart before the shader starts dissolving (Yard→Video)
  dissolveStop: 500, // per-colour opacity ramp — each stop's duration
  dissolveSpread: 500, // spread between the first and last stop's start
  balanceDur: 864, // field balance (uFieldDensity) tween duration
  balanceLead: SHIM, // WHEN the balance tween starts (independent of the dissolve's revealLead)
  videoBalance: -1.35, // balance TARGET at Video (magnitude, not a time)
  revealSettle: 1350, // paces Video enter (unlock, mute CTA, first playback); the shader freeze waits for whenSettled() (T3.8)
  posterHide: 1600, // Video→Yard: re-hide the poster layer once the shader re-covers it

  // ── Core module motion (anim.js T reads these) ─────────────────────
  moduleDur: 700, // base cross-module transition
  primaryDur: 600, // main text (title / prompt) enter
  anchorDur: 240, // corner anchors — quicker; also the exit duration
  stagger: 100, // gap between staggered enter elements
  reduceMotionDur: 120, // duration when prefers-reduced-motion
  // PER-TRANSITION start-offsets — each transition times its own clips
  // independently. deck routes these into ui.trans; anim/yard/deck read them.
  // Defaults preserve current timing (cascade-in leads by 320, everything 0).
  hyTextIn: SHIM, hyAnchorIn: SHIM, hyCascadeIn: SHIM, hyWash: SHIM, hyBrand: SHIM, hyTextOut: SHIM, hyHairline: SHIM, // hero→yard
  yhTextIn: SHIM, yhAnchorIn: SHIM, yhTextOut: SHIM, yhCascadeOut: SHIM, yhBrand: SHIM, yhHairline: SHIM, // yard→hero
  yvTextOut: SHIM, yvCascadeOut: SHIM, yvHairline: SHIM, // yard→video
  vyTextIn: SHIM, vyAnchorIn: SHIM, vyCascadeIn: SHIM, vyHairline: SHIM, // video→yard (palette already washed on return; no wash/brand)
  hrTextIn: SHIM, hrAnchorIn: SHIM, // hero reveal (first load)
  returnLead: SHIM, // Video→Yard shader rebuild start-offset
  vyBalance: SHIM, // Video→Yard balance-back start-offset (independent of the stops)

  // ── Shader ─────────────────────────────────────────────────────────
  colorStagger: 0.45, // palette-tween stagger (fraction of the tween spread across stops)
  washMs: 700, // field COLOUR-WASH tween duration (split out of moduleDur so the
  //             field re-colour is tunable independently of brand recolour / poster fade)
  hairlineFadeMs: 275, // Yard diagonal accent-lines (hairlines) fade duration
  canvasFadeMs: 800, // shader canvas first fade-in at boot

  // ── Deck: gesture / nav ────────────────────────────────────────────
  nextFrameFallback: 120, // rAF-paused fallback so a transition still progresses
  wheelResetMs: 220, // wheel silence that ends a gesture (accum + lock reset)
  wheelMinLockMs: 250, // min lock time before a magnitude-based unlock is allowed
  navCooldownMs: 900, // same-direction over-step cooldown (≈ moduleDur + margin)
  unwashDelayMs: SHIM, // delay before a treatment-less target unwashes (Yard→Hero)
  deckGuardMs: 1400, // unlock CAP (deck.js unlockCap): input unlocks + the old section hides at
  //                    min(this, max(exit, enter)) after one frame, so whenever a transition runs
  //                    longer than this, the cap IS its end. Retuning this OR any lead moves that
  //                    unlock moment (load-bearing feel), not just a safety net.

  // ── Idle dim ───────────────────────────────────────────────────────
  idleMs: 10000, // no-interaction delay before content dims (Hero + Video)

  // ── Yard cascade / roll ────────────────────────────────────────────
  cascadeInLead: 350, // lead before the entry cascade begins (module lands first)
  cascadeInStagger: 69, // ms between logos entering
  cascadeOutStagger: 42, // ms between logos leaving (tighter)
  cascadeOutDur: 311, // per-logo exit duration (entry uses primaryDur)
  rollInterval: 3200, // base cadence between single-slot logo swaps
  rollJitter: 0.4, // ± fraction of the interval, so the wall never pulses in lockstep
  resizeDebounceMs: 150, // resize re-split / reconcile debounce (Hero + Yard)

  // ── Yard mobile (single fullscreen logo — no wall, no diagonal) ─────
  // Mobile Yard shows one logo, so it INHERITS the desktop cascade lead + per-logo
  // duration (per-transition via ui.trans; stagger is moot with one logo). The one
  // thing it can't inherit is travel: desktop nudges each small logo along the
  // diagonal (CASCADE_DX/DY); a fullscreen logo needs a larger straight rise.
  yardMobileRiseY: 80, // px the logo rises from (enter) / continues to (exit)
  // Mobile per-transition text-out lead. Mobile Yard is a single fullscreen logo
  // (no 10-logo wall), so the text-out doesn't wait for a wall to stream away —
  // the mobile Yard exit uses these instead of yvTextOut / yhTextOut (which are
  // paced for the desktop cascade). Tuned on the "(mobile)" timelines in /edit/.
  yvTextOutM: SHIM, // mobile Yard→Video text-out lead
  yhTextOutM: SHIM,   // mobile Yard→Hero text-out lead

  // ── Video: audio fades / gate ──────────────────────────────────────
  fadeIn: 1000, // audio fade-in on enter / resume
  fadeOut: 300, // audio fade-out on exit
  fadeMute: 300, // audio fade on mute (snappy)
  fadeUnmute: 1000, // audio fade on unmute (gentle)
  wrongResetMs: 1200, // wrong-code → locked auto-reset
  wedgePollMs: 250, // WebKit MSE stuck-before-range poller interval
  quotaRetryMs: 1000, // MSE quota-backpressure retry beat (gate.js)

  // ── Hero / boot ────────────────────────────────────────────────────
  firstEnterLead: 1000, // first-load Hero entrance lead
  fontFallbackMs: 4000, // safety: start the deck even if the font CDN is blocked

  // ── CSS-driven durations (synced to :root via cssVars.js) ──────────
  // Values are verbatim from index.html's original hardcoded CSS. main.js
  // pushes these onto :root at boot; the dev panel retunes them live.
  revealMs: 200, // --reveal-dur: title/reveal-inner CSS reveal token
  idleFadeMs: 400, // --dur-idle-fade: .content idle dim fade
  teaserFadeMs: 400, // --dur-teaser-fade: .v-teaser.ready fade-in
  enterFadeMs: 160, // --dur-enter-fade: .v-enter fade-in
  progressFillMs: 120, // --dur-progress: .v-progress::after width fill
  muteFadeMs: 240, // --dur-mute-fade: .v-mute CTA opacity appear
  muteVisualMs: 400, // --dur-mute-visual: .v-mute backdrop + ::before/::after/__l (coupled)
  shakeMs: 360, // --dur-shake: wrong-code shake keyframe
  kbSlideMs: 320, // --dur-kb-slide: mobile keyboard-open corner slides
  caretBlinkMs: 1600, // --dur-caret-blink: password caret blink cadence (periodic)
  cursorWeightMs: 80, // --dur-cursor-weight: .char font-weight transition (curve dur)
};

// ── Legacy flat-key shim ───────────────────────────────────────────────────
const cellGet = (row, field) => field.split(".").reduce((o, k) => (o == null ? undefined : o[k]), TRANSITIONS[row]);
function cellSet(row, field, v) {
  const parts = field.split(".");
  let o = TRANSITIONS[row];
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = v;
}

for (const [key, cells] of Object.entries(LEGACY_KEYS)) {
  // Redefining an existing property keeps its position in the key order.
  Object.defineProperty(TIMINGS, key, {
    get: () => cellGet(cells[0][0], cells[0][1]),
    set: (v) => { for (const [row, field] of cells) cellSet(row, field, v); },
    enumerable: true,
    configurable: true,
  });
}
for (const k of Object.keys(TIMINGS)) {
  if (TIMINGS[k] === SHIM) throw new Error(`timings.js: ${k} has no LEGACY_KEYS cell`);
}

// "*".cascadeIn stays linked to the scalar TIMINGS.cascadeInLead (D7: scalars keep their names).
Object.defineProperty(TRANSITIONS["*"], "cascadeIn", {
  get: () => TIMINGS.cascadeInLead,
  set: (v) => { TIMINGS.cascadeInLead = v; },
  enumerable: true,
  configurable: true,
});

// ── Resolution ─────────────────────────────────────────────────────────────
const LEAD_FIELDS = ["textIn", "anchorIn", "textOut", "cascadeIn", "cascadeOut", "hairline", "wash", "brand", "unwash"];
const SHADER_FIELDS = ["dissolve", "balance", "reverse", "timer"];

/**
 * Resolve the 13 lead fields for one transition.
 * @param {string} fromId  outgoing module id, or "@boot" for the first-load entrance
 * @param {string|null} toId incoming module id (null for "@boot")
 * @param {boolean} mobile  mobile breakpoint matches
 * @returns frozen {textIn, anchorIn, textOut, cascadeIn, cascadeOut, hairline, wash, brand, unwash,
 *                  shader:{dissolve, balance, reverse, timer}}
 * A null/undefined cell falls back to "*" (as the legacy `lead()` did). `unwash` is null unless the
 * target is Hero (the only unpaused, treatment-less module). Unknown pair → "*".
 */
export function resolveLeads(fromId, toId, mobile) {
  const base = TRANSITIONS["*"];
  const key = fromId === "@boot" ? "@boot" : `${fromId}>${toId}`;
  const row = Object.prototype.hasOwnProperty.call(TRANSITIONS, key) ? TRANSITIONS[key] : {};
  const layers = [row, (mobile && row.mobile) || {}];
  const pick = (field, from) => {
    let v = from[field];
    for (const l of layers) {
      const src = from === base ? l : l.shader || {};
      if (src[field] != null) v = src[field];
    }
    return v;
  };
  const out = {};
  for (const f of LEAD_FIELDS) out[f] = pick(f, base);
  if (toId !== "hero") out.unwash = null;
  const shader = {};
  for (const f of SHADER_FIELDS) shader[f] = pick(f, base.shader);
  out.shader = Object.freeze(shader);
  return Object.freeze(out);
}

// ── Validator (dev only; never called at import) ───────────────────────────
/**
 * @param {Iterable|object} [registry] modules ({id, pauseShader} or {id, shader:{paused}}),
 *   as an array/iterable or {modules:[…]}.
 * @returns {string[]} warnings (also console.warn'ed)
 */
export function validateTimings(registry) {
  const warn = [];
  const ROW_FIELDS = new Set([...LEAD_FIELDS, "shader", "mobile"]);
  for (const [key, cells] of Object.entries(LEGACY_KEYS)) {
    if (!(key in TIMINGS)) warn.push(`legacy key ${key} missing from TIMINGS`);
    const vals = cells.map(([row, field]) => {
      if (!TRANSITIONS[row]) warn.push(`${key}: unknown row ${row}`);
      const v = cellGet(row, field);
      if (v === undefined) warn.push(`${key}: ${row}.${field} does not resolve`);
      return v;
    });
    if (vals.some((v) => !Object.is(v, vals[0]))) warn.push(`${key}: cells disagree (${vals.join(", ")})`);
  }
  for (const [key, row] of Object.entries(TRANSITIONS)) {
    for (const f of Object.keys(row)) if (!ROW_FIELDS.has(f)) warn.push(`TRANSITIONS["${key}"]: unknown field ${f}`);
    if (row.shader) for (const f of Object.keys(row.shader)) if (!SHADER_FIELDS.includes(f)) warn.push(`TRANSITIONS["${key}"].shader: unknown field ${f}`);
    if (row.mobile) for (const f of Object.keys(row.mobile)) if (!LEAD_FIELDS.includes(f)) warn.push(`TRANSITIONS["${key}"].mobile: unknown field ${f}`);
  }
  if (registry) {
    const mods = Array.isArray(registry) ? registry : registry.modules ? [...registry.modules] : [...registry];
    const paused = (m) => !!(m.shader && m.shader.paused != null ? m.shader.paused : m.pauseShader);
    for (const a of mods) for (const b of mods) {
      if (a === b || paused(a) === paused(b)) continue;
      const k = `${a.id}>${b.id}`;
      if (!TRANSITIONS[k] || !TRANSITIONS[k].shader)
        warn.push(`${k}: modules differ in pauseShader but the pair has no explicit shader row (falls back to "*", no dissolve path)`);
    }
  }
  const yv = resolveLeads("yard", "video", false).shader.dissolve;
  if (TIMINGS.revealSettle < yv + TIMINGS.dissolveSpread + TIMINGS.dissolveStop)
    warn.push(`revealSettle ${TIMINGS.revealSettle} < yard>video dissolve ${yv} + dissolveSpread + dissolveStop (${yv + TIMINGS.dissolveSpread + TIMINGS.dissolveStop}) — harmless since T3.8 (the deck freezes on whenSettled(), after the dissolve)`);
  if (typeof console !== "undefined") warn.forEach((w) => console.warn("[timings]", w));
  return warn;
}
