// Shared idle-dim: after `idleMs` of no interaction, add `.idle` to a module's
// content element (CSS fades it to ~5%); any interaction wakes it; the timer is
// paused while the tab is hidden. Used by Hero and Video so the behavior + timing
// stay in one place. getContent is a function (the element is created at mount).

import { TIMINGS } from "./timings.js";

// The delay is read live from TIMINGS.idleMs at each wake, so the timeline
// panel can retune it.
export function createIdleDimmer(getContent) {
  let timer = null;
  let armed = false;
  let bound = false;
  // getContent may return a single element OR an array of elements (Video dims
  // its content and its mute CTA, which live in different layers). Normalize to
  // a list so `.idle` is toggled on each.
  const els = () => {
    const v = typeof getContent === "function" ? getContent() : getContent;
    return (Array.isArray(v) ? v : [v]).filter(Boolean);
  };

  const wake = () => {
    els().forEach((c) => c.classList.remove("idle"));
    if (!armed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (document.hidden) return;
      els().forEach((c) => c.classList.add("idle"));
    }, TIMINGS.idleMs);
  };

  const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"];
  const onVisibility = () => {
    if (document.hidden) {
      if (timer) clearTimeout(timer);
    } else {
      wake();
    }
  };

  return {
    wake,
    // Arm the timer (call once the entrance has settled), then start counting.
    arm() {
      armed = true;
      wake();
    },
    bind() {
      if (bound) return;
      bound = true;
      events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
      document.addEventListener("visibilitychange", onVisibility);
    },
    unbind() {
      bound = false;
      events.forEach((e) => window.removeEventListener(e, wake));
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
      armed = false;
    },
  };
}
