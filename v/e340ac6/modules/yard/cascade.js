// Yard cascade: logos fade/slide/de-blur in or out one after another along the
// diagonal, sequenced by scroll direction. Timing-critical — the function bodies
// below are moved verbatim from the former modules/yard.js.
//
// createCascade({ liveSlots }) → { cascadeOrder(scrollDown), cascadeLogos(dir, scrollDown) → Promise }

import { T, SNAP } from "../../framework/anim.js";
import { TIMINGS } from "../../framework/timings.js";
import { ui } from "../../framework/bus.js";
import { isMobileLayout } from "./layout.js";

// Cascade reveal/hide: logos fade/rise/de-blur one after another along the
// diagonal ASCENDING direction (bottom-left leads → top-right trails) so the
// wall streams in and out with the cascade rather than snapping as a block.
// Stagger (cascadeInStagger / cascadeOutStagger) + entry lead (cascadeInLead)
// live in TIMINGS. The lead makes the title/module land before the logos stream
// in; exit has no lead. ?logolead=300 on dev hosts overrides the lead
// (src/dev/yardParams.js).
export const CASCADE_COL_WEIGHT = 170; // weight of a column step vs vertical position
// Per-logo travel along the diagonal itself (up-right = +x, −y; the ratio ≈ the
// Figma diagonal's slope). Entering logos slide up-right INTO place from the
// down-left; exiting logos continue up-right and out — the same cascade axis.
export const CASCADE_DX = 18;
export const CASCADE_DY = 9;

export function createCascade({ liveSlots }) {
  // Live slots ordered along the diagonal. The cascade follows the SCROLL
  // direction: scrolling the page top→bottom ("down") reveals top-right first,
  // bottom-left last; scrolling bottom→top ("up") reverses that. Applies to both
  // the entry and exit cascades so the wall always streams the way you scroll.
  const cascadeOrder = (scrollDown) => {
    const score = (s) => s.topPx - s.col * CASCADE_COL_WEIGHT;
    const ordered = liveSlots().slice().sort((a, b) => score(a) - score(b)); // top-right first
    return scrollDown ? ordered : ordered.reverse();
  };

  // Cascade the logos in ("in") or out ("out"), sequenced by scroll direction.
  // Returns a Promise that settles when the last logo finishes, so exit can wait
  // for the wall to fully clear.
  const cascadeLogos = (dir, scrollDown) => {
    const ordered = cascadeOrder(scrollDown);
    const mobile = isMobileLayout();
    const tr = ui.trans || {};
    // Timing is SHARED with desktop: mobile inherits the per-transition lead and
    // the per-logo duration (with one live logo the stagger is moot anyway). Only
    // the travel differs (diagonal wall vs a single vertical rise — see below).
    const stagger = dir === "in" ? TIMINGS.cascadeInStagger : TIMINGS.cascadeOutStagger;
    const lead =
      dir === "in"
        ? tr.cascadeIn != null
          ? tr.cascadeIn
          : TIMINGS.cascadeInLead
        : tr.cascadeOut || 0; // per-transition cascade start-offset
    const duration = dir === "in" ? T.primaryDur : TIMINGS.cascadeOutDur;
    const shown = { opacity: 1, transform: "translate(0, 0)", filter: "blur(0)" };
    // Hidden-state offset. Desktop: ALONG the diagonal, MIRRORED by scroll
    // direction so the whole cascade (both the stagger order above and the
    // per-icon travel here) follows the way you scroll. Scrolling down: enter
    // from down-left → slide up-right into place; exit continues up-right — the
    // wall streams up-right. Scrolling up: mirror it. Mobile: no wall, so the lone
    // logo travels straight along the scroll axis (yardMobileRiseY), MIRRORED by
    // direction the same way the title/anchors do (anim.js animateIn/OutSet):
    // scroll down → enter from below/exit upward; scroll up → enter from above/
    // exit downward.
    const dl = `translate(${-CASCADE_DX}px, ${CASCADE_DY}px)`; // down-left
    const ur = `translate(${CASCADE_DX}px, ${-CASCADE_DY}px)`; // up-right
    const riseY = TIMINGS.yardMobileRiseY;
    const enterSign = scrollDown ? 1 : -1; // = anim.js: dir "up" → −1, else +1
    const exitSign = scrollDown ? -1 : 1; // leaves opposite to how the next enters
    const offEnter = mobile
      ? `translate(0, ${enterSign * riseY}px)` // comes FROM (below on down, above on up)
      : scrollDown
        ? dl
        : ur; // where entering logos come FROM
    const offExit = mobile
      ? `translate(0, ${exitSign * riseY}px)` // travels TO (up on down, down on up)
      : scrollDown
        ? ur
        : dl; // where exiting logos travel TO
    const frames =
      dir === "in"
        ? [{ opacity: 0, transform: offEnter, filter: "blur(6px)" }, shown]
        : [shown, { opacity: 0, transform: offExit, filter: "blur(6px)" }];
    const anims = [];
    ordered.forEach((s, k) => {
      // Every logo in the slot — a swap in flight stacks the incoming logo over
      // the outgoing one, and both must ride the cascade (or one is left showing
      // in an exiting section). Normally a slot holds exactly one logo. Skip
      // non-rendered elements (WAAPI `.finished` never settles for them) — same
      // test as anim.js isRendered.
      s.el.querySelectorAll(".y-logo").forEach((logo) => {
        if (logo.getClientRects().length === 0) return;
        logo.getAnimations().forEach((a) => a.cancel()); // drop any prior cascade
        const a = logo.animate(frames, {
          duration,
          delay: lead + k * stagger,
          easing: SNAP,
          fill: "both",
        });
        anims.push(a.finished.catch(() => {}));
      });
    });
    return Promise.all(anims);
  };

  return { cascadeOrder, cascadeLogos };
}
