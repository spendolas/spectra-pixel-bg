// Yard roll engine: fills the live slots with distinct random brands and swaps
// one random live slot at a time to a fresh off-screen brand (no brand twice on
// screen). Every swap routes through swapBrand(effect, from, to) (framework/
// swap.js) — or yardGL's GLSL glitch when the WebGL wall is active — so the
// transition is a pluggable, isolated unit.
//
// createRoller({ slots, gl }) → { liveSlots, reconcile, rollOnce, pendingSwaps,
//   abortRolls, startRolling, stopRolling, setActive, setSwapEffect }
//   slots : the module's persistent slot array (mutated in place by index.js)
//   gl    : the yardGL instance (initYardGL)
// The function bodies below are moved verbatim from the former modules/yard.js.

import { reduceMotion } from "../../framework/anim.js";
import { swapBrand, GLITCH } from "../../framework/swap.js";
import { TIMINGS } from "../../framework/timings.js";
import { BRANDS } from "../brands.js";
import { makeLogo } from "./layout.js";

const rand = (n) => Math.floor(Math.random() * n);
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function createRoller({ slots, gl }) {
  // Mirrors the module's `active` flag (index.js sets it at the same points it
  // flips its own): the roll cadence only runs while Yard is active.
  let active = false;
  let rollTimer = null;

  // Which swap transition the roll uses. Named key into swap.js's SWAP_EFFECTS.
  // `let` only so the dev ?fx= override (src/dev/yardParams.js) can retarget it.
  let SWAP_EFFECT = "glitch";

  // Rolling engine state. `slots` are persistent DOM cells; a slot is "live"
  // when it's currently rendered (visible in this layout) — the roll only
  // touches live slots, so desktop↔mobile is just which slots the CSS shows.
  const isLive = (slot) => slot && slot.el.offsetParent !== null;
  const liveSlots = () => slots.filter(isLive);
  // Brands currently shown across the live wall — the roll pool is everything
  // else, which guarantees no brand appears twice on screen.
  const shownIds = () => new Set(liveSlots().map((s) => s.brandId).filter(Boolean));
  const poolFor = (excludeExtra) => {
    const taken = shownIds();
    if (excludeExtra) taken.add(excludeExtra);
    return BRANDS.filter((b) => !taken.has(b.id));
  };

  // Assign a distinct random brand to every live slot that has none yet
  // (initial fill + slots newly revealed by a resize). Instant, no transition.
  const reconcile = () => {
    const empties = liveSlots().filter((s) => !s.brandId);
    if (!empties.length) return;
    const pool = shuffle(poolFor());
    empties.forEach((s) => {
      const b = pool.pop();
      if (!b) return;
      s.brandId = b.id;
      const logo = makeLogo(b);
      logo.style.opacity = "1";
      s.el.appendChild(logo);
    });
  };

  // Swap one random live slot to a fresh off-screen brand via the pluggable
  // effect. Skips busy slots so a slow effect can't be re-entered mid-flight.
  const rollOnce = () => {
    const live = liveSlots().filter((s) => !s.busy && s.brandId);
    if (!live.length) return;
    const slot = live[rand(live.length)];
    const pool = poolFor(slot.brandId);
    if (!pool.length) return;
    const next = pool[rand(pool.length)];

    const fromEl = slot.el.querySelector(".y-logo");
    const toEl = makeLogo(next);
    toEl.style.opacity = "0";
    slot.el.appendChild(toEl);
    slot.busy = true;
    slot.brandId = next.id; // claim immediately so the pool excludes it at once
    const ctrl = new AbortController();
    const signal = ctrl.signal;

    // The roll picks the path: when the WebGL wall is mounted and active it owns
    // the whole visual (DOM logos are hidden by yardGL), so the glitch runs as
    // yardGL's GLSL port and the DOM only carries the new brand at rest.
    // Otherwise the DOM effect runs via swapBrand (which also owns the
    // reduced-motion / no-outgoing-logo instant path). Either Promise resolves
    // once the swap is visually complete (or aborted via `signal`).
    const usesGL = gl.active && fromEl && SWAP_EFFECT === "glitch" && !reduceMotion();
    // Only DOM swaps are registered for abort-on-exit. A WebGL glitch is left to
    // finish (160 ms): an aborted one leaves its plane on the OUTGOING brand's
    // texture (yardGL restore(false)), which would then ride the exit cascade
    // stretched into the incoming logo's box — and persist on a quick return.
    slot.ctrl = usesGL ? null : ctrl;
    let swap;
    if (usesGL) {
      toEl.style.opacity = "1";
      swap = gl.glitchSwap(slot.el, fromEl, toEl, GLITCH, { signal });
    } else {
      swap = swapBrand(SWAP_EFFECT, fromEl, toEl, { signal });
    }

    const settle = () => {
      if (slot.ctrl === ctrl) slot.ctrl = null;
      slot.busy = false;
    };
    const pending = Promise.resolve(swap).then(() => {
      if (fromEl && fromEl.parentNode) fromEl.remove();
      toEl.style.opacity = "1";
      settle();
    }).catch(settle);
    pendingSwaps.add(pending);
    pending.then(() => pendingSwaps.delete(pending));
  };

  // Settled-chain promises of every swap still in flight (both paths). A quick
  // return waits on these before resyncing the WebGL wall to the DOM.
  const pendingSwaps = new Set();

  // Abort every in-flight DOM swap (exit): each effect resolves early and
  // restores, and the .then above drops the outgoing logo, so no slot is left
  // stacked. WebGL swaps are never registered here (see rollOnce).
  const abortRolls = () => {
    slots.forEach((s) => {
      if (s.ctrl) s.ctrl.abort();
    });
  };

  const nextDelay = () =>
    Math.round(TIMINGS.rollInterval * (1 + (Math.random() * 2 - 1) * TIMINGS.rollJitter));

  const scheduleRoll = () => {
    rollTimer = setTimeout(() => {
      if (active && !document.hidden) rollOnce();
      if (active) scheduleRoll(); // keep the cadence alive across a hidden tab
    }, nextDelay());
  };
  const startRolling = () => {
    if (rollTimer) return;
    scheduleRoll();
  };
  const stopRolling = () => {
    if (rollTimer) clearTimeout(rollTimer);
    rollTimer = null;
  };

  return {
    liveSlots,
    reconcile,
    rollOnce,
    pendingSwaps,
    abortRolls,
    startRolling,
    stopRolling,
    setActive: (v) => {
      active = v;
    },
    setSwapEffect: (fx) => {
      SWAP_EFFECT = fx;
    },
  };
}
