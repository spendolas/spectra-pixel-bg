// Background director: owns the shader state (palette, seed, balance, per-stop
// alpha, preset/palette choice, treatment), all tweens and the colour tokens,
// and drives a BackgroundEngine. Moved from src/framework/shader.js (T3.4);
// behaviour unchanged. Public API = the controller returned by createDirector.

import { darkestHex, tintedWhite, lerpHex, lumOf } from "../framework/color.js";
import { TIMINGS } from "../framework/timings.js";
import { reduceMotion } from "../framework/anim.js";
import { IS_DEV_HOST, isDevEnabled } from "../framework/devHost.js";
import {
  DEFAULT_OPTIONS,
  safePresets,
  safePalettes,
  pickRandomExcluding,
  buildOptions,
} from "./config.js";
import { tween, settled } from "./tween.js";
import { getCanvas } from "./engines/spectra.js";

// Reduced motion (T3.10): when reduceMotion() (prefers-reduced-motion, read LIVE
// at each tween start, so a system toggle applies to the next tween) is true, the
// palette / dissolve / balance tweens each run for TIMINGS.reduceMotionDur in
// TOTAL — no per-stop stagger, no start delay — with the same smoothstep. The
// field clock keeps running. With it off, every tween is byte-identical to before.
const smooth = (t) => t * t * (3 - 2 * t);

// Palette-tween stagger lives in TIMINGS.colorStagger (fraction of a color tween
// spread across its stops so they arrive in a wave, not lockstep; 0 = synchronous).

// Per-colour opacity dissolve (dissolveField), ABSOLUTE ms: each stop's alpha
// ramps over TIMINGS.dissolveStop, and the stops' STARTS are spread across
// TIMINGS.dissolveSpread (first stop at 0, last at SPREAD; in-between interpolated
// by rank). Read LIVE from TIMINGS inside dissolveField so the timeline panel can
// retune without a reload. Total run = spread + stop.

export const writeTokens = (colors) => {
  const root = document.documentElement.style;
  root.setProperty("--color-surface", darkestHex(colors));
  root.setProperty("--c-white", tintedWhite(colors));
};

/**
 * @param {object} o
 * @param {object} o.initialOpts    the boot option set (buildOptions result)
 * @param {object|null} o.chosenPreset
 * @param {object|null} o.chosenPalette
 * @param {object|null} o.effect    the raw spectraGL handle (exposed as .effect for dev/harness)
 * @param {import("./types.js").BackgroundEngine|null} o.engine
 * @param {import("./types.js").EngineCaps} o.caps
 */
export function createDirector({ initialOpts, chosenPreset, chosenPalette, effect, engine, caps }) {
  // `engine` and `caps` are reassigned by useEngine() (fallback swap): every
  // read below goes through these bindings, so the new engine's caps apply.
  let treatmentTween = null; // in-flight palette tween (applyTreatment / clearTreatment)
  let dissolveTween = null; // in-flight per-colour field dissolve (dissolveField)
  let balanceTween = null; // in-flight field balance tween (tweenBalance)
  // Current per-colour field opacity (drives the fork's uColorOpacity uniform via
  // updateOptions — the only public path). Local source of truth for tweening.
  let fieldOpacity = new Array(caps.slots || caps.stops).fill(1);
  // Director-owned shader state (T3.2): the controller is the source of truth for
  // what it last wrote — palette, seed, balance (plus fieldOpacity above,
  // chosenPreset/chosenPalette and activeColorTreatment below). Nothing reads
  // back from the engine. Every controller write goes through an engine setter
  // and then mirror(), which records the same payload into this state.
  let palette = initialOpts.colors; // current shader colour stops
  let seed = initialOpts.field.seed; // current field seed [x, y]
  let balance = initialOpts.fieldDensity; // current field balance (uFieldDensity); unset → 0
  const mirror = (o) => {
    if ("colors" in o) palette = o.colors;
    if (o.field && "seed" in o.field) seed = o.field.seed;
    if ("fieldDensity" in o) balance = o.fieldDensity;
  };
  const currentSeed = () => (Array.isArray(seed) ? seed : DEFAULT_OPTIONS.field.seed);
  const currentBalance = () => (typeof balance === "number" ? balance : 0);
  // Colors treatment currently in force (e.g. Yard's fixed set). Rerolls swap
  // the BASE palette (and tokens) underneath it but must not clobber it.
  let activeColorTreatment = null; // { colors, keepTokens } | null

  // Tween the shader palette to `target` over tweenMs (instant when falsy),
  // reporting each step to `tokens` (writeTokens, or a no-op to pin the UI).
  // Returns the tween's done promise (resolved at once on the instant path).
  const tweenColors = (target, tweenMs, tokens, startDelay = 0) => {
    if (treatmentTween) {
      treatmentTween.cancel();
      treatmentTween = null;
    }
    if (!tweenMs) {
      engine.setPalette(target);
      mirror({ colors: target });
      tokens(target);
      return settled();
    }
    const current = palette || initialOpts.colors;
    // Pad the shorter list by repeating its last stop so counts line up.
    const from = target.map((_, i) => current[Math.min(i, current.length - 1)]);
    // startDelay holds the from-colors for a beat before the tween moves — lets a
    // transition begin (module content entering) before the palette shifts, e.g.
    // the Yard→Hero unwash trailing the reveal. The tween still runs tweenMs once
    // it starts, so it lands at startDelay + tweenMs.
    if (reduceMotion()) {
      // Reduced motion: all stops together, no hold, reduceMotionDur in total.
      const rmStart = performance.now();
      const rmDur = TIMINGS.reduceMotionDur;
      treatmentTween = tween({
        start: rmStart,
        onStep: (now) => {
          const t = Math.min(1, Math.max(0, (now - rmStart) / rmDur));
          const cur = target.map((hex, i) => lerpHex(from[i], hex, smooth(t)));
          engine.setPalette(cur);
          mirror({ colors: cur });
          tokens(cur);
          return t < 1;
        },
      });
      return treatmentTween.done;
    }
    const start = performance.now() + startDelay;
    // Luminance-ordered stagger: each stop animates over its own sub-window, but
    // the WAVE follows brightness, not array index. Direction (authoritative —
    // this is what the code below does): when the palette brightens overall
    // (e.g. entering Yard's wash), the BRIGHTEST colour leads; when it darkens
    // (leaving the wash), the DARKEST colour leads. We rank by the luminance of
    // the more-contrasty ("colour") end — the darker-average palette — since the
    // washed end is near-uniform grey. COLOR_STAGGER = fraction of the tween
    // spread across the stops; the trailing stop still lands exactly at tweenMs.
    const n = target.length;
    const span = 1 - TIMINGS.colorStagger;
    const fromLum = from.map(lumOf);
    const targetLum = target.map(lumOf);
    const avg = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
    const brightening = avg(targetLum) > avg(fromLum);
    const refLum = brightening ? fromLum : targetLum; // the contrasty "colour" end
    const order = target.map((_, i) => i).sort((a, b) => refLum[a] - refLum[b]); // dark→bright
    const rankOf = new Array(n);
    // brightening → brightest colour leads (rank 0); darkening → darkest leads.
    order.forEach((idx, pos) => (rankOf[idx] = brightening ? n - 1 - pos : pos));
    const step = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / tweenMs));
      const cur = target.map((hex, i) => {
        const delay = n > 1 ? TIMINGS.colorStagger * (rankOf[i] / (n - 1)) : 0;
        const local = Math.min(1, Math.max(0, (t - delay) / span));
        const eased = local * local * (3 - 2 * local);
        return lerpHex(from[i], hex, eased);
      });
      engine.setPalette(cur);
      mirror({ colors: cur });
      tokens(cur);
      return t < 1;
    };
    treatmentTween = tween({ start, onStep: step });
    return treatmentTween.done;
  };

  let frozen = false; // last freeze()/unfreeze() (debugState)
  let dissolveTarget = null; // `to` of the latest timed per-stop dissolve

  // Reroll (bound to R / P / O by keys.js): "all" = preset + palette + new seed,
  // "palette" = palette only (keeps the field seed), "preset" = preset + new seed.
  // opts.keepSeed overrides the seed rule (keys.js passes the independent P-key
  // match, so a key matching both R and P keeps the seed, as it always did).
  const reroll = (kind, opts = {}) => {
    if (!engine) return; // no shader → nothing to roll (keys are only bound with an engine)
    const rollSeed = currentSeed();

    if (kind === "all") {
      chosenPreset = pickRandomExcluding(safePresets, chosenPreset) || chosenPreset;
      chosenPalette = pickRandomExcluding(safePalettes, chosenPalette) || chosenPalette;
    } else if (kind === "palette") {
      chosenPalette = pickRandomExcluding(safePalettes, chosenPalette) || chosenPalette;
    } else if (kind === "preset") {
      chosenPreset = pickRandomExcluding(safePresets, chosenPreset) || chosenPreset;
    } else {
      return;
    }

    if (safePresets.length === 0 && safePalettes.length === 0) return;
    if (treatmentTween) {
      treatmentTween.cancel(); // snap any tween; the roll takes it from here
      treatmentTween = null;
    }
    const keepSeed = opts.keepSeed !== undefined ? !!opts.keepSeed : kind === "palette";
    const nextOptions = keepSeed
      ? buildOptions(chosenPreset, chosenPalette, { seed: rollSeed })
      : buildOptions(chosenPreset, chosenPalette);
    if (activeColorTreatment) {
      // A treatment owns the visible colors: reroll everything else, keep (or
      // snap a mid-tween to) the treatment's palette — a DERIVED treatment
      // re-derives from the fresh roll, so it follows the palette game.
      // Tokens follow the BASE roll when the treatment pinned them
      // (keepTokens), else the treatment.
      if (activeColorTreatment.derive)
        activeColorTreatment.colors = activeColorTreatment.derive(nextOptions.colors);
      engine.setScene(nextOptions, activeColorTreatment.colors);
      mirror({ ...nextOptions, colors: activeColorTreatment.colors });
      writeTokens(
        activeColorTreatment.keepTokens ? nextOptions.colors : activeColorTreatment.colors
      );
    } else {
      engine.setScene(nextOptions);
      mirror(nextOptions);
      writeTokens(nextOptions.colors);
    }
    if (IS_DEV_HOST) {
      window.__chosenPreset = chosenPreset;
      window.__chosenPalette = chosenPalette;
    }
  };

  const controller = {
    effect,
    // Freeze/resume the RAF — the clock is a clamped delta accumulator, so this
    // resumes from the same frame (≤0.1s). Never destroys the context.
    freeze() {
      if (engine) {
        engine.setPlaying(false);
        frozen = true;
      }
    },
    unfreeze() {
      if (engine) {
        engine.setPlaying(true);
        frozen = false;
      }
    },
    reroll,
    // Dev/harness snapshot of the director-owned state (read-only copies).
    debugState() {
      const live = (t) => !!(t && t.active);
      return {
        palette: (palette || initialOpts.colors).slice(),
        alphas: fieldOpacity.slice(),
        balance: currentBalance(),
        seed: currentSeed().slice(),
        preset: chosenPreset ? chosenPreset.name : null,
        frozen,
        tweens: { dissolve: live(dissolveTween), balance: live(balanceTween), colors: live(treatmentTween) },
      };
    },
    // Getters over the director-owned state + balance setter (callers never
    // reach into effect.options). Without an engine they return the defaults.
    // Current shader palette stops (a copy).
    getPalette() {
      const colors = (engine && palette) || initialOpts.colors;
      return colors.slice();
    },
    // Current field seed [x, y].
    getSeed() {
      return engine ? currentSeed() : DEFAULT_OPTIONS.field.seed;
    },
    // Current field balance (uFieldDensity); 0 when unset.
    getBalance() {
      return engine ? currentBalance() : 0;
    },
    // Set the field balance instantly (no tween).
    setBalance(v) {
      if (!engine || !engine.writable) return;
      engine.setBalance(v);
      mirror({ fieldDensity: v });
    },
    // Whole-field opacity via the canvas (blunt fallback). ms=0 = instant.
    setOpacity(to, ms = 0) {
      const canvas = (engine && engine.el) || getCanvas();
      if (!canvas) return;
      canvas.style.transition = ms ? `opacity ${ms}ms ease` : "none";
      canvas.style.opacity = String(Math.max(0, Math.min(1, to)));
    },
    // Per-COLOUR dissolve: fade the palette colours' opacity toward `to` (0..1)
    // over `ms`, staggered by colour so the field dissolves colour-by-colour
    // (pixel mode blends 4 stops; alpha is banded by the field value). Drives
    // the uColorOpacity uniform in the fork; if it's unavailable, falls back to
    // the whole-field canvas fade so transitions still reveal. Reusable — the
    // deck calls this per transition from each module's shader opacity
    // (shaderIntent(mod).opacity: `shader.opacity`, legacy `shaderOpacity`).
    // `reverse` flips the per-stop stagger order — so the RETURN transition
    // (Video→Yard) plays the dissolve as a true time-reverse of the outbound one
    // (stops come back in the opposite order they left).
    // Returns a promise resolved when this dissolve completes or is superseded.
    dissolveField(to, ms = 0, reverse = false) {
      if (!engine || !engine.writable) {
        this.setOpacity(to, ms); // no shader → whole-field canvas fallback
        return settled();
      }
      // Engine without per-stop alpha (css fallback): fade its whole surface
      // over the dissolve's full span (spread + stop) instead. Instant when !ms.
      if (!engine.caps.perStopAlpha) {
        for (let i = 0; i < fieldOpacity.length; i++) fieldOpacity[i] = to;
        this.setOpacity(to, ms ? (reduceMotion() ? TIMINGS.reduceMotionDur : TIMINGS.dissolveSpread + TIMINGS.dissolveStop) : 0);
        return settled();
      }
      if (dissolveTween) {
        dissolveTween.cancel();
        dissolveTween = null;
      }
      const len = fieldOpacity.length;
      const push = () => engine.setStopAlpha(fieldOpacity.slice());
      if (!ms) {
        for (let i = 0; i < len; i++) fieldOpacity[i] = to;
        push();
        return settled();
      }
      const COUNT = caps.stops; // pixel mode uses colour stops 0–3
      // Absolute-ms model (see DISSOLVE_STOP_MS / DISSOLVE_SPREAD_MS): each stop
      // ramps over STOP_MS; starts fan out across SPREAD by rank. `ms` (the passed
      // window) no longer drives per-stop timing — it only gates the instant path
      // above and the no-shader fallback. `reverse` flips the rank order so the
      // return plays the wave backwards.
      const from = fieldOpacity.slice();
      dissolveTarget = to; // where this dissolve lands (useEngine snaps to it on a swap)
      if (reduceMotion()) {
        // Reduced motion: every stop together (no spread), reduceMotionDur in total.
        const rmStart = performance.now();
        const rmDur = TIMINGS.reduceMotionDur;
        dissolveTween = tween({
          start: rmStart,
          onStep: (now) => {
            const t = Math.min(1, Math.max(0, (now - rmStart) / rmDur));
            for (let i = 0; i < len; i++) fieldOpacity[i] = from[i] + (to - from[i]) * smooth(t);
            push();
            return t < 1;
          },
        });
        return dissolveTween.done;
      }
      const start = performance.now();
      const DISSOLVE_STOP_MS = TIMINGS.dissolveStop; // read live per run
      const DISSOLVE_SPREAD_MS = TIMINGS.dissolveSpread;
      const total = DISSOLVE_SPREAD_MS + DISSOLVE_STOP_MS;
      const step = (now) => {
        const elapsed = now - start;
        for (let i = 0; i < len; i++) {
          const baseRank = i < COUNT ? i : COUNT - 1;
          const rank = reverse ? COUNT - 1 - baseRank : baseRank;
          const delay = COUNT > 1 ? DISSOLVE_SPREAD_MS * (rank / (COUNT - 1)) : 0;
          const local = Math.min(1, Math.max(0, (elapsed - delay) / DISSOLVE_STOP_MS));
          const eased = local * local * (3 - 2 * local);
          fieldOpacity[i] = from[i] + (to - from[i]) * eased;
        }
        push();
        return elapsed < total;
      };
      dissolveTween = tween({ start, onStep: step });
      return dissolveTween.done;
    },
    // Tween the field BALANCE (uFieldDensity — the pre-colour dark/bright dial)
    // toward `to` over `ms`. Runs alongside dissolveField so the field can empty
    // out (go dark) as the palette fades to transparent — e.g. Yard↔Video drives
    // balance to its minimum and back in step with the opacity reveal. `startDelay`
    // mirrors the deck's reveal lead so it stays in sync on the veil path.
    // Returns a promise resolved when this tween completes or is superseded.
    tweenBalance(to, ms = 0, startDelay = 0) {
      if (!engine || !engine.writable) return settled();
      if (balanceTween) {
        balanceTween.cancel();
        balanceTween = null;
      }
      const from = currentBalance();
      if (!ms) {
        engine.setBalance(to);
        mirror({ fieldDensity: to });
        return settled();
      }
      if (reduceMotion()) {
        // Reduced motion: no start delay, reduceMotionDur in total.
        const rmStart = performance.now();
        const rmDur = TIMINGS.reduceMotionDur;
        balanceTween = tween({
          start: rmStart,
          onStep: (now) => {
            const t = Math.min(1, Math.max(0, (now - rmStart) / rmDur));
            const v = from + (to - from) * smooth(t);
            engine.setBalance(v);
            mirror({ fieldDensity: v });
            return t < 1;
          },
        });
        return balanceTween.done;
      }
      const start = performance.now() + startDelay;
      const step = (now) => {
        const t = Math.min(1, Math.max(0, (now - start) / ms));
        const eased = t * t * (3 - 2 * t);
        const v = from + (to - from) * eased;
        engine.setBalance(v);
        mirror({ fieldDensity: v });
        return t < 1;
      };
      balanceTween = tween({ start, onStep: step });
      return balanceTween.done;
    },
    // Swap the engine under the director (T3.6 fallback chain: spectra failed →
    // css). An in-flight dissolve is completed at once: it is cancelled (its
    // awaiting callers resolve, as for any superseded dissolve) and the per-stop
    // alpha snaps to its TARGET, so the new surface lands where the dissolve was
    // heading (fully clear / fully shown), never at a mid-dissolve mean. Then the
    // director-owned state (palette, per-stop alpha, balance, play state) is
    // replayed onto the new engine and the old one destroyed. Palette and
    // balance tweens keep running and drive the new engine from their next frame.
    useEngine(next) {
      const old = engine;
      if (!next || next === old) return;
      if (dissolveTween) {
        const wasActive = dissolveTween.active;
        dissolveTween.cancel();
        dissolveTween = null;
        if (wasActive && dissolveTarget != null)
          for (let i = 0; i < fieldOpacity.length; i++) fieldOpacity[i] = dissolveTarget;
      }
      engine = next;
      // Adopt the new engine's caps (stops / slots / perStopAlpha …) and re-size
      // the per-stop alpha state to its slot count: stop i keeps its alpha, extra
      // slots follow the last stop (as spectra's slots 4–6 follow stop 3).
      caps = { ...next.caps };
      const slots = caps.slots || caps.stops;
      if (slots !== fieldOpacity.length) {
        const prev = fieldOpacity;
        fieldOpacity = Array.from({ length: slots }, (_, i) => prev[Math.min(i, prev.length - 1)]);
      }
      if (controller.engine !== undefined) controller.engine = next;
      if (old && old.id === "spectra") {
        // The spectraGL handle is destroyed below — don't leave dev handles on it.
        controller.effect = null;
        if (IS_DEV_HOST && typeof window !== "undefined") window.__spectra = null;
      }
      try {
        next.setPalette((palette || initialOpts.colors).slice());
        next.setStopAlpha(fieldOpacity.slice());
        next.setBalance(currentBalance());
        next.setPlaying(!frozen);
      } catch (e) {
        console.warn("[background] engine replay failed", e);
      }
      if (old) {
        try {
          old.destroy();
        } catch (e) {
          console.warn("[background] engine destroy failed", e);
        }
      }
    },
    // Resolves once no field dissolve and no balance tween is in flight
    // (immediately when idle). Palette tweens are not counted. Re-checks after
    // each wait, so a tween started meanwhile is waited for too.
    whenSettled() {
      const pending = [dissolveTween, balanceTween].filter((t) => t && t.active);
      if (!pending.length) return settled();
      return Promise.all(pending.map((t) => t.done)).then(() => controller.whenSettled());
    },
    // Apply a colour treatment and recompute the dynamic color tokens. `colors`
    // (or `derive`) + `tweenMs` animates the palette (and the tokens with it)
    // from the current stops to the target over tweenMs (smoothstep). Treatments
    // are colour-only: any other key is ignored (see below).
    // `keepTokens: true` shifts the shader palette WITHOUT touching the dynamic
    // dark/white tokens — for treatments (Yard) where the UI must keep the
    // rolled palette's tokens while the background drifts elsewhere. A colors
    // treatment stays in force across rerolls (they swap the base underneath)
    // until clearTreatment() restores the rolled palette.
    // `derive: (baseColors) => hexes` makes the treatment DYNAMIC: the target is
    // computed from the currently rolled palette (and recomputed on rerolls),
    // e.g. Yard's washPalette. Static `colors` still works for fixed sets.
    // Treatments are COLOUR-ONLY by contract (T3.5): {colors|derive, tweenMs,
    // keepTokens}. Any other key is ignored (never sent to the engine) and, when
    // dev is enabled, reported with console.warn.
    // Returns the palette tween's done promise (resolved at once when none runs).
    applyTreatment(delta) {
      if (!engine || !delta) return settled();
      const { tweenMs, keepTokens, derive, colors, ...rest } = delta;
      const extra = Object.keys(rest);
      if (extra.length && isDevEnabled())
        console.warn("[background] applyTreatment: treatments are colour-only; ignored key(s):", extra.join(", "));
      let target = colors;
      if (typeof derive === "function") {
        target = derive(buildOptions(chosenPreset, chosenPalette, { seed: currentSeed() }).colors);
      }
      if (!target) return settled();
      activeColorTreatment = {
        colors: target,
        keepTokens: !!keepTokens,
        tweenMs,
        derive: typeof derive === "function" ? derive : null,
      };
      return tweenColors(target, tweenMs, keepTokens ? () => {} : writeTokens);
    },
    // Drop the colors treatment and return to the currently rolled palette
    // (retokenizing). The DECK decides the timing from the incoming module:
    // shader visible → glide (defaults to the apply tween, symmetric); shader
    // covered/frozen → 0 for a silent snap. No-op when nothing is in force.
    // Returns the palette tween's done promise (resolved at once when none runs).
    clearTreatment(tweenMs, delayMs = 0) {
      if (!engine || !activeColorTreatment) return settled();
      if (tweenMs === undefined) tweenMs = activeColorTreatment.tweenMs;
      activeColorTreatment = null;
      const base = buildOptions(chosenPreset, chosenPalette, { seed: currentSeed() }).colors;
      // delayMs lets the deck hold the wash a beat into the transition so the
      // unwash trails the reveal (Yard→Hero) instead of starting on frame 1.
      return tweenColors(base, tweenMs, writeTokens, delayMs);
    },
  };
  return controller;
}
