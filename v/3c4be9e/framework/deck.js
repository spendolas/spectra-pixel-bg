// Scroll-takeover controller: a deck of full-viewport modules navigated one
// step per gesture. Registry-driven (order = registry order). See DESIGN.md §11.

import { ui } from "./bus.js";
import { T, SNAP, reduceMotion } from "./anim.js";
import { TIMINGS, TRANSITIONS, resolveLeads } from "./timings.js";
import { mqMobile } from "./breakpoints.js";
import { isDevEnabled } from "./devHost.js";

// Resolve next paint — but never hang if rAF is paused (backgrounded tab):
// a timeout fallback guarantees the transition still progresses.
const nextFrame = () =>
  new Promise((r) => {
    requestAnimationFrame(() => r());
    setTimeout(r, TIMINGS.nextFrameFallback);
  });

// Persistent-anchor rule: an anchor that exists IDENTICALLY in both modules
// (same role at the same box — e.g. the Hero↔Yard furniture) doesn't
// exit/enter. Identity is the anchor's data-anchor key ("brand"|"locale"|"cta",
// set by mkAnchor) first, its trimmed .reveal-inner text second (anchors without
// a key, e.g. Video's corners). Matching is automatic and per-transition, so a
// pair whose position differs at the current breakpoint (Hero centers the brand
// on mobile; Yard pins it top) simply falls back to the normal animation.
const anchorKey = (el) => {
  const a = typeof el.closest === "function" ? el.closest("[data-anchor]") : null;
  return a ? a.dataset.anchor : null;
};
const matchPersistentAnchors = (fromSection, toSection) => {
  const inners = (sec) => Array.from(sec.querySelectorAll(".reveal-inner"));
  const outs = inners(fromSection);
  const pairs = [];
  inners(toSection).forEach((inn) => {
    const key = anchorKey(inn);
    const text = inn.textContent.trim();
    const out =
      (key && outs.find((o) => anchorKey(o) === key)) ||
      outs.find((o) => o.textContent.trim() === text);
    if (!out) return;
    const a = out.getBoundingClientRect();
    const b = inn.getBoundingClientRect();
    if (
      Math.abs(a.left - b.left) > 1 ||
      Math.abs(a.top - b.top) > 1 ||
      Math.abs(a.width - b.width) > 1 ||
      Math.abs(a.height - b.height) > 1
    )
      return;
    pairs.push({ out, inn });
  });
  return pairs;
};

// Cancel stale SCRIPT animations (WAAPI, e.g. a fill:"both" exit left from an
// earlier unmatched transition) so they can't override the swap's inline
// opacity. CSS transitions/animations are left alone. Never throws.
const cancelStaleAnimations = (el) => {
  try {
    if (typeof el.getAnimations !== "function") return;
    el.getAnimations().forEach((a) => {
      if (a.transitionProperty === undefined && a.animationName === undefined) a.cancel();
    });
  } catch (e) {
    /* best effort */
  }
};

// Per-transition leads (T2.11): every move resolves its 13 lead fields from
// TRANSITIONS (timings.js) — the single source of truth. Resolution must never
// wedge navigation: if matchMedia or resolveLeads throws, fall back to a frozen
// snapshot of the "*" row taken once at load (so it follows the coded defaults);
// the literals are only the last resort if even that snapshot fails.
const FALLBACK_LEADS = (() => {
  try {
    const r = TRANSITIONS["*"];
    const out = {};
    for (const f of ["textIn", "anchorIn", "textOut", "cascadeIn", "cascadeOut", "hairline", "wash", "brand", "unwash"]) {
      if (typeof r[f] !== "number") throw new Error(`"*".${f} is not a number`);
      out[f] = r[f];
    }
    const s = r.shader;
    if (typeof s.dissolve !== "number" || typeof s.balance !== "number") throw new Error('"*".shader incomplete');
    out.shader = Object.freeze({ dissolve: s.dissolve, balance: s.balance, reverse: !!s.reverse, timer: !!s.timer });
    return Object.freeze(out);
  } catch (e) {
    console.warn("[leads]", "fallback snapshot failed", e);
    return Object.freeze({
      textIn: 0, anchorIn: 0, textOut: 0, cascadeIn: 350, cascadeOut: 0, hairline: 0, wash: 0, brand: 0, unwash: 382,
      shader: Object.freeze({ dissolve: 0, balance: 0, reverse: false, timer: false }),
    });
  }
})();
const safeMobile = () => {
  try {
    return mqMobile().matches;
  } catch (e) {
    console.warn("[leads]", "matchMedia failed", e);
    return false;
  }
};
const safeLeads = (fromId, toId, mobile) => {
  try {
    return resolveLeads(fromId, toId, mobile);
  } catch (e) {
    console.warn("[leads]", "resolve failed", e);
    return FALLBACK_LEADS;
  }
};
// The six clip leads modules read through ui.trans (anim.js, yard, cascade).
const transOf = (L) => ({
  textIn: L.textIn, anchorIn: L.anchorIn, textOut: L.textOut,
  cascadeIn: L.cascadeIn, cascadeOut: L.cascadeOut, hairline: L.hairline,
});

// A module's shader/layout intent (T2.12). The one place module shader flags are
// read: prefers the structured mod.shader / mod.layout, falls back to the legacy
// flat properties (pauseShader, shaderOpacity, shaderBalance, shaderTreatment —
// Video still declares those). `paused` = freeze the shader; `undecked` = the
// module's content lives outside #deck (so #deck passes clicks through) and
// defaults to `paused`. opacity/balance stay null/undefined when not declared
// (the deck applies its defaults); a function balance is evaluated on read.
export const shaderIntent = (mod) => {
  const s = (mod && mod.shader) || {};
  const pick = (k, legacy) => (s[k] !== undefined ? s[k] : mod[legacy]);
  const paused = !!pick("paused", "pauseShader");
  const balance = pick("balance", "shaderBalance");
  const layout = mod.layout || {};
  return {
    paused,
    opacity: pick("opacity", "shaderOpacity"),
    balance: typeof balance === "function" ? balance() : balance,
    treatment: pick("treatment", "shaderTreatment"),
    undecked: layout.undecked != null ? !!layout.undecked : paused,
  };
};

const WHEEL_THRESHOLD = 40; // accumulated deltaY to commit one step (px, not time)
// New-impulse detection: after a step fires, the wheel locks for the rest of
// that gesture's momentum tail. Unlock needs a REAL fresh flick — the tail's
// jitter can't fake one because the test compares against a slowly-decaying
// ENVELOPE of the tail (not the previous event), demands a real-flick floor
// (WHEEL_MIN_IMPULSE), and respects a minimum lock time
// (TIMINGS.wheelMinLockMs). A direction
// reversal unlocks instantly (momentum never reverses — that's the user).
// Magnitude-based unlock (needs TWO consecutive large events, see onWheel). A single
// event is never enough: momentum tails carry lone 2–3× spikes. Set false for silence/reversal only.
const WHEEL_MAGNITUDE_UNLOCK = true;
const WHEEL_RISE_FACTOR = 1.3; // new flick must beat envelope × this…
const WHEEL_MIN_IMPULSE = 55; // …and this floor (real fresh flicks 70–450; a momentum-tail jitter spike reached 31, so a 30 floor let one unlock the tail → double step)
const WHEEL_ENVELOPE_DECAY = 0.85; // per-event decay of the tail envelope
const WHEEL_TAIL_WINDOW_MS = 4000; // after a step, the tail can run this long…
const WHEEL_TAIL_RESET_MS = 450; // …so the gesture-end silence is this long (not wheelResetMs) in that window
const SWIPE_THRESHOLD = 50; // px
// Time values live in TIMINGS (read live below): wheelResetMs (gesture-end
// silence), wheelMinLockMs (min lock before a magnitude unlock), navCooldownMs
// (same-direction over-step cooldown, ≈ moduleDur + margin). Per-transition leads
// (incl. the unwash delay before a treatment-less target unwashes, e.g. Yard→Hero)
// come from TRANSITIONS via safeLeads().

export function createDeck({ registry, shader, root }) {
  const sections = [];
  let active = 0;
  let transitioning = false;
  let started = false;
  let navCooldownUntil = 0;
  let lastNavDir = null;
  let navToken = 0; // bumped per go(); guards deferred (setTimeout) reveal work
  // Per-transition AbortSignal (ctx.signal, Tier B): the current transition's
  // controller is aborted the moment a newer go() starts. ADDITIVE — navToken and
  // every token check stay authoritative; modules may ignore the signal.
  let navAbort = null;
  const nextSignal = () => {
    try {
      if (navAbort) navAbort.abort();
    } catch (e) {
      /* a throwing abort listener must never block navigation */
    }
    navAbort = typeof AbortController === "function" ? new AbortController() : null;
    return navAbort ? navAbort.signal : null;
  };

  // Mount every module once, in registry order, into its own section.
  registry.forEach((mod, i) => {
    const section = document.createElement("section");
    section.className = "module is-hidden";
    section.dataset.index = String(i);
    section.dataset.module = mod.id || `module-${i}`;
    if (mod.scheme === "light") section.classList.add("scheme-light");
    root.appendChild(section);
    if (typeof mod.mount === "function") mod.mount(section);
    sections.push(section);
  });

  const applyShaderFor = (mod) => {
    const I = shaderIntent(mod);
    if (I.paused) shader.freeze();
    else shader.unfreeze();
    if (I.treatment) shader.applyTreatment(I.treatment);
  };

  async function go(target, direction) {
    if (transitioning || !started) return;
    if (target < 0 || target >= registry.length || target === active) return;
    // Same-direction over-step guard (see TIMINGS.navCooldownMs). Reversals bypass it.
    if (direction === lastNavDir && performance.now() < navCooldownUntil) return;
    transitioning = true;
    navCooldownUntil = performance.now() + TIMINGS.navCooldownMs;
    lastNavDir = direction;
    const myNav = ++navToken;
    const signal = nextSignal();

    const from = active;
    const fromMod = registry[from];
    const toMod = registry[target];
    let pairs = [];

    // Per-transition start-offsets (leads), resolved once per move from
    // TRANSITIONS (incl. the mobile row — e.g. Yard's mobile text-out). The six
    // clip leads go into ui.trans so anim.js/yard time their clips independently;
    // shader/wash/brand/unwash are applied by the deck below from L.
    // ctx is the transition context handed to exit()/enter() (frozen just before
    // they run, once `persist` is known). ui.trans / ui.persist stay set too, as
    // the fallback for modules that ignore ctx (Video) and for Yard's cascade.
    const mobile = safeMobile();
    const ctx = { from: fromMod.id, to: toMod.id, dir: direction, mobile, leads: safeLeads(fromMod.id, toMod.id, mobile), persist: null, signal };
    const L = ctx.leads;
    ui.trans = transOf(L);
    // The incoming module's shader/layout intent (read once, synchronously, here).
    const toI = shaderIntent(toMod);

    try {
    // Incoming section on top (standard). A shader-hidden module (Video) keeps its
    // own content in a fixed layer BELOW the shader canvas (undecked), so the
    // shader simply dissolving on top uncovers it — no veil, module z-order stays
    // conventional.
    sections[target].classList.remove("is-hidden");
    sections[target].classList.add("active");
    sections[target].style.zIndex = "2";
    sections[from].style.zIndex = "1";

    // Reveal the incoming background: dissolve the shader field toward the incoming
    // module's target opacity (default 1 = fully visible; any module declares
    // shader.opacity) + tween the field balance. On the shader-hides path
    // (Yard→Video) this LEADS by L.shader.dissolve so the outgoing module's content
    // departs first (Yard's logos cascade out) before the bg swaps — mirroring the
    // delayed unwash on Yard→Hero. Token-guarded: a superseding nav cancels a
    // still-pending reveal.
    const targetOpacity = toI.opacity == null ? 1 : toI.opacity;
    // Field balance travels to the incoming module's target (default 0 = resting)
    // in lockstep with the opacity dissolve — so a module that hides the shader
    // (Video) also empties the field to dark as it fades, and rebuilds on return.
    const targetBalance = toI.balance == null ? 0 : toI.balance;
    // The RETURN leg (coming FROM a shader-paused module back to a visible one,
    // e.g. Video→Yard; L.shader.reverse) plays the dissolve as a time-reverse of
    // the outbound one — stops rebuild in the opposite order they dissolved.
    // Opacity dissolve and field balance are scheduled INDEPENDENTLY on their own
    // leads when L.shader.timer (the Yard/Hero↔Video rows: shader-hides and return
    // legs); other transitions fire both synchronously.
    const doDissolve = () => {
      if (navToken !== myNav) return;
      if (typeof shader.dissolveField === "function") shader.dissolveField(targetOpacity, T.moduleDur, L.shader.reverse);
      else if (typeof shader.setOpacity === "function") shader.setOpacity(targetOpacity, T.moduleDur);
    };
    const doBalance = () => {
      if (navToken !== myNav) return;
      if (typeof shader.tweenBalance === "function") shader.tweenBalance(targetBalance, TIMINGS.balanceDur);
    };
    if (L.shader.timer) {
      setTimeout(doDissolve, L.shader.dissolve);
      setTimeout(doBalance, L.shader.balance);
    } else {
      doDissolve();
      doBalance();
    }

    // Shader: bring it back before entering a module that wants it; if the
    // incoming module pauses it, freeze only after its enter covers the canvas.
    // The INCOMING module owns the treatment: apply its own, or — when it has
    // none and the shader stays visible — dissolve the outgoing one in view.
    // (A shader-hidden target instead snaps silently once covered; see below.)
    if (!toI.paused) shader.unfreeze();
    if (toI.treatment) {
      const wl = L.wash; // per-transition colour-wash start-offset
      if (wl > 0)
        setTimeout(() => { if (navToken === myNav) shader.applyTreatment(toI.treatment); }, wl);
      else shader.applyTreatment(toI.treatment);
    } else if (!toI.paused) shader.clearTreatment(undefined, L.unwash);

    // Let the just-revealed section flush layout/style before animating, so
    // WAAPI engages an active timeline (animations on a still-display:none
    // element freeze at currentTime 0).
    await nextFrame();

    // Persistent anchors: mark the matched pairs so anim.js skips them, keep
    // the OUTGOING one on screen and tween only its color to the incoming
    // scheme's; the two swap silently in the same paint at the end.
    pairs = matchPersistentAnchors(sections[from], sections[target]);
    ui.persist = pairs.length
      ? new Set(pairs.flatMap((p) => [p.out, p.inn]))
      : null;
    ctx.persist = ui.persist;
    pairs.forEach((p) => {
      p.colorAnim = p.out.animate(
        [
          { color: getComputedStyle(p.out).color },
          { color: getComputedStyle(p.inn).color },
        ],
        {
          duration: reduceMotion() ? TIMINGS.reduceMotionDur : T.moduleDur,
          delay: reduceMotion() ? 0 : L.brand, // per-transition brand-recolour offset
          easing: SNAP,
          fill: "both",
        }
      );
    });

      Object.freeze(ctx);
      const exitP = fromMod.exit ? fromMod.exit(direction, ctx) : Promise.resolve();
      const enterP = toMod.enter ? toMod.enter(direction, ctx) : Promise.resolve();
      // Transition END: the race below is the unlock moment (transitioning=false,
      // old section hidden, ui.persist cleared — see finally). unlockCap
      // (TIMINGS.deckGuardMs) is NOT just an anti-wedge safety net: whenever
      // exit+enter take longer than it, the cap IS the transition end, so
      // retuning deckGuardMs or any lead moves the unlock moment. A rejected
      // (e.g. cancelled) animation also ends the transition early (.catch) —
      // kept as shipped.
      const unlockCap = new Promise((res) => setTimeout(res, TIMINGS.deckGuardMs));
      await Promise.race([Promise.all([exitP, enterP]).catch(() => {}), unlockCap]);
    } finally {
      ui.persist = null;
      // Swap persistent pairs in the same synchronous block that hides the old
      // section — one paint, no flicker. Cancel the color tween so the old
      // element (now hidden) returns to its own scheme for its next enter.
      pairs.forEach((p) => {
        cancelStaleAnimations(p.inn);
        p.inn.style.opacity = "1";
        if (p.colorAnim) p.colorAnim.cancel();
      });
      sections[from].classList.remove("active");
      sections[from].classList.add("is-hidden");
      sections[target].style.zIndex = "";
      sections[from].style.zIndex = "";
      // Covered/frozen: the treatment state (e.g. Yard's wash) stays in the
      // uniforms so returning to the treated module resumes it already applied
      // — no visible mid-tween on reveal. Entering a treatment-less VISIBLE
      // module is what restores base (the clearTreatment() glide above).
      // The freeze waits for the director's dissolve + balance tweens to finish
      // (T3.8): unlock happens here, before the Yard→Video dissolve's last frame
      // (≈1350 vs ≈1470 ms), and freezing then could strand a stop mid-fade. It is
      // skipped if a newer go() started or we left the target meanwhile. No
      // optional call: a director without whenSettled() must fail loudly.
      // Reduced motion does not change this ordering: Video's enter() still paces
      // unlock on revealSettle (~1350 ms), and the reduced dissolve (470 + 120 ms)
      // has finished long before.
      if (toI.paused) {
        const my = navToken;
        shader.whenSettled().then(() => {
          if (navToken === my && active === target) shader.freeze();
        });
      }
      active = target;
      transitioning = false;
      // An undecked module (Video) keeps its content in the body-level
      // .v-backdrop BELOW the shader; #deck (z-10) would otherwise capture every
      // click over it. Let #deck pass clicks through to the backdrop for those.
      root.style.pointerEvents = toI.undecked ? "none" : "auto";
    }
  }

  const step = (delta) => go(active + delta, delta > 0 ? "down" : "up");

  // ---- gestures ----
  // One module per scroll gesture: firing a step LOCKS the wheel so the
  // trackpad/Wacom momentum tail (which outlives the transition by ~1s) can't
  // re-accumulate and over-step. The lock releases on TIMINGS.wheelResetMs of
  // wheel silence (gesture over), on a direction reversal (instant), or on a
  // genuine fresh flick — judged against the tail's decaying ENVELOPE, never
  // event-to-event jitter, and never within TIMINGS.wheelMinLockMs of the step.
  let wheelAccum = 0;
  let wheelTimer = null;
  let wheelLocked = false;
  let wheelLockDir = 0;
  let wheelLockAt = 0;
  let wheelEnvelope = 0;
  let wheelRiseStreak = 0;
  let wheelRiseBase = 0;
  // Dev-only wheel trace (?wheeldebug on a dev host): one console line per wheel
  // event with what the guard did with it. Inert in production.
  const wheelDebug = isDevEnabled() && /[?&]wheeldebug\b/.test(location.search);
  let wheelDbgT0 = 0;
  let wheelDbgLastStep = -1e9;
  const wheelDbgRing = [];
  const wlog = (e, d, verdict) => {
    if (!wheelDebug) return;
    const now = performance.now();
    const gap = wheelDbgT0 ? Math.round(now - wheelDbgT0) : 0;
    wheelDbgT0 = now;
    const line =
      `[wheel] +${gap}ms dY=${e.deltaY} dX=${e.deltaX} mode=${e.deltaMode} d=${d.toFixed(1)} ` +
      `trans=${transitioning} lock=${wheelLocked} accum=${wheelAccum.toFixed(0)} env=${wheelEnvelope.toFixed(0)} -> ${verdict}`;
    console.log(line);
    // Ring of the last 40 lines; two STEPs inside 2.5 s (a likely double scroll)
    // dump it in one warning so the trace around the extra step survives.
    wheelDbgRing.push(line);
    if (wheelDbgRing.length > 40) wheelDbgRing.shift();
    if (verdict.startsWith("STEP")) {
      if (now - wheelDbgLastStep < 2500) console.warn("[wheel] DOUBLE STEP?\n" + wheelDbgRing.join("\n"));
      wheelDbgLastStep = now;
    }
  };
  const onWheel = (e) => {
    e.preventDefault();
    // Normalize non-pixel delta modes (1 = lines, 2 = pages) to ~pixels so the
    // thresholds below mean the same thing on every device/browser config.
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 120 : 1;
    const d = e.deltaY * scale;
    const abs = Math.abs(d);

    // Gesture-end silence. A sparse pen/Wacom wheel can pause longer than this
    // mid-gesture; if that happens while a transition runs, the lock must NOT
    // release (the first event after the transition would count as a fresh
    // gesture and step a second module). So while transitioning, re-arm and
    // measure the silence from the transition's end instead.
    if (wheelTimer) clearTimeout(wheelTimer);
    // Right after a step the old gesture's momentum tail is still arriving, and
    // its cadence can hiccup (a 225 ms gap was traced mid-tail: the 220 ms reset
    // fired, the next tail events re-accumulated and stepped a second module).
    // So within WHEEL_TAIL_WINDOW_MS of the step, silence must last longer.
    const armWheelReset = () => {
      const inTail = wheelLocked && performance.now() - wheelLockAt < WHEEL_TAIL_WINDOW_MS;
      wheelTimer = setTimeout(
        () => {
          if (transitioning) return armWheelReset();
          wheelAccum = 0;
          wheelLocked = false;
          wheelEnvelope = 0;
          wheelRiseStreak = 0;
        },
        inTail ? Math.max(TIMINGS.wheelResetMs, WHEEL_TAIL_RESET_MS) : TIMINGS.wheelResetMs,
      );
    };
    armWheelReset();

    // Envelope of the gesture's recent magnitude: rides peaks, decays slowly.
    // Tested BEFORE folding the current event in, so a real flick is compared
    // to the tail it interrupts, not to itself.
    const envelope = wheelEnvelope;
    wheelEnvelope = Math.max(abs, wheelEnvelope * WHEEL_ENVELOPE_DECAY);

    if (transitioning) {
      wheelRiseStreak = 0;
      return wlog(e, d, "swallowed (transition)");
    }
    if (wheelLocked) {
      const reversed = wheelLockDir !== 0 && Math.sign(d) === -wheelLockDir;
      // New flick = TWO consecutive events that each beat the tail's envelope (taken
      // from before the first of them) and the floor. A lone spike inside a momentum
      // tail (traced: 56 in a 32 tail, 412 in a 100 tail) never qualifies; a real
      // flick's onset is a run of large events. Without this the lock only ended on
      // silence, and long tails (3-4 s) made the next scroll feel dead.
      const base = wheelRiseStreak > 0 ? wheelRiseBase : envelope;
      const bigEnough =
        performance.now() - wheelLockAt > TIMINGS.wheelMinLockMs &&
        abs > Math.max(base * WHEEL_RISE_FACTOR, WHEEL_MIN_IMPULSE);
      if (bigEnough) {
        if (wheelRiseStreak === 0) wheelRiseBase = envelope;
        wheelRiseStreak++;
      } else {
        wheelRiseStreak = 0;
      }
      const rising = WHEEL_MAGNITUDE_UNLOCK && wheelRiseStreak >= 2;
      if (!reversed && !rising) return wlog(e, d, "swallowed (tail)"); // still the old gesture's tail
      wheelRiseStreak = 0;
      wheelLocked = false;
      wheelAccum = 0;
    }
    wheelAccum += d;
    if (Math.abs(wheelAccum) >= WHEEL_THRESHOLD) {
      wheelLocked = true;
      wheelLockDir = wheelAccum > 0 ? 1 : -1;
      wheelLockAt = performance.now();
      wlog(e, d, `STEP ${wheelLockDir}`);
      step(wheelLockDir);
      wheelAccum = 0;
      return;
    }
    wlog(e, d, "accumulating");
  };

  let touchStartY = null;
  const TAP_SLOP = 10; // px of movement before we treat it as a swipe, not a tap
  const onTouchStart = (e) => {
    touchStartY = e.touches[0].clientY;
  };
  const onTouchMove = (e) => {
    // Only take over once the finger actually moves (a swipe). Preventing the
    // default on a tap's micro-jitter makes iOS drop the synthetic click, so a
    // tap would never focus a module's <input> (no keyboard). Let taps pass.
    if (touchStartY == null) return;
    if (Math.abs(e.touches[0].clientY - touchStartY) < TAP_SLOP) return;
    if (e.cancelable) e.preventDefault();
  };
  // A cancelled touch (system gesture, incoming call, …) never fires touchend:
  // drop the stale start so the next touchmove can't misjudge a tap as a swipe.
  const onTouchCancel = () => {
    touchStartY = null;
  };
  const onTouchEnd = (e) => {
    if (touchStartY == null) return;
    const dy = e.changedTouches[0].clientY - touchStartY;
    touchStartY = null;
    if (Math.abs(dy) > SWIPE_THRESHOLD) {
      const delta = dy < 0 ? 1 : -1; // swipe up → next
      step(delta);
    }
  };

  const onKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    // Arrow / Page / Home / End always drive navigation — even when a module is
    // capturing the keyboard for typing (Video). Space navigates ONLY when not
    // captured, since a typing module needs it as a literal character. Same for
    // any focused editable field (e.g. dev-panel inputs): Space is left to it.
    if (k === " ") {
      if (ui.capture) return;
      const t = e.target;
      if (t instanceof Element && t.matches("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      step(1);
    } else if (k === "ArrowDown" || k === "PageDown") {
      e.preventDefault();
      step(1);
    } else if (k === "ArrowUp" || k === "PageUp") {
      e.preventDefault();
      step(-1);
    } else if (k === "Home") {
      e.preventDefault();
      go(0, "up");
    } else if (k === "End") {
      e.preventDefault();
      go(registry.length - 1, "down");
    }
  };

  function start(startIndex = 0) {
    if (started) return;
    started = true;
    active = startIndex;

    sections.forEach((s, i) => {
      s.classList.toggle("is-hidden", i !== active);
      s.classList.toggle("active", i === active);
    });

    const m0 = registry[active];
    applyShaderFor(m0);
    root.style.pointerEvents = shaderIntent(m0).undecked ? "none" : "auto"; // see go()'s finally
    // First-load entrance uses the "@boot" row's leads.
    const bootMobile = safeMobile();
    const bootCtx = Object.freeze({
      from: "@boot", to: m0.id, dir: "down", mobile: bootMobile,
      leads: safeLeads("@boot", null, bootMobile), persist: null, signal: nextSignal(),
    });
    ui.trans = transOf(bootCtx.leads);
    // Defer one frame so the section is rendered before its entrance animates.
    requestAnimationFrame(() => {
      if (m0.enter) m0.enter("down", bootCtx);
    });

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchCancel, { passive: true });
    window.addEventListener("keydown", onKey);
  }

  return {
    start,
    go,
    step,
    get active() {
      return active;
    },
    get count() {
      return registry.length;
    },
  };
}
