// Yard module — light-scheme client wall: a staggered logo grid (desktop) /
// single rolling logo (mobile) over the washed shader. The module's "surface"
// is the shader itself, washed to grayscale via a derived treatment (wash.js).
// Mirrors Hero's title split / variable-weight patterns. See DESIGN.md §5/§7/§11.
//
// This file is the lifecycle only (mount / enter / exit / unmount). The parts:
//   layout.js   slot grid, logo/slot factories, diagonals, isMobileLayout
//   roll.js     brand fill + periodic swaps (createRoller)
//   cascade.js  logo cascade in/out (createCascade)
//   wash.js     shader wash treatment (createWash)
// Dev-only tooling (URL overrides, wash panel, lab roll hook) lives in src/dev/
// and is loaded lazily through yardApi when isDevEnabled().

import { enterModule, exitModule, SNAP } from "../../framework/anim.js";
import { createCharWeight } from "../../framework/charWeight.js";
import { TIMINGS } from "../../framework/timings.js";
import { ui } from "../../framework/bus.js";
import { isDevEnabled } from "../../framework/devHost.js";

const YARD_DEV_KEYS = ["wash", "chroma", "washtarget", "fx", "roll", "logolead", "washui"];
function wantsYardDev() {
  if (/^\/(lab|edit)(\/|$)/.test(location.pathname)) return true;
  for (const k of new URLSearchParams(location.search).keys()) {
    if (YARD_DEV_KEYS.includes(k) || k.startsWith("g_")) return true;
  }
  return false;
}
import { initYardGL } from "../../framework/yardGL.js";
import { splitTitleIntoLines } from "../../framework/titleSplit.js";
import { mkAnchor } from "../../framework/anchors.js";
import { BRANDS } from "../brands.js";
import { SLOT_CELLS, makeSlot, buildDiagonals, isMobileLayout } from "./layout.js";
import { createRoller } from "./roll.js";
import { createCascade } from "./cascade.js";
import { createWash } from "./wash.js";

const TITLE_TEXT = "Worked with the brightest";

export function createYard() {
  let section, content, title, brand, locale, cta, grid;
  let active = false;

  // Persistent slot cells (filled in mount(), mutated in place so the roller
  // and cascade keep the same array). See roll.js for the live-slot model.
  const slots = [];
  let diagEl = null; // diagonal-lines svg

  // Production WebGL mirror of the logo wall (Task 6). Created once here; mounted
  // in enter() once reconcile() has built the DOM logos it rasterises, and torn
  // down at the END of exit() (after the cascade-out) so the mirror covers the
  // whole time on Yard. mount() is async + self-guarding (reduced-motion /
  // no-WebGL / 0 logos all no-op), so enter() must NOT await it.
  const gl = initYardGL(() => section);
  let diagFade = null; // in-flight diagonal-lines opacity fade
  // Bumped by every exit(); a deferred gl.unmount() only runs if no newer exit
  // superseded it and Yard has not been re-entered meanwhile.
  let exitToken = 0;

  const wash = createWash();
  const treatment = wash.treatment;

  const roller = createRoller({ slots, gl });
  const { liveSlots, reconcile, rollOnce, pendingSwaps, abortRolls, startRolling, stopRolling } = roller;
  const { cascadeLogos } = createCascade({ liveSlots });

  // Dev hooks (null / empty in production — only src/dev/ sets them).
  let devOnEnterSettled = null; // called after each enter() settles
  const devMountQueue = []; // fns waiting for mount(section)

  const weight = createCharWeight();

  const attachWeight = () => {
    if (title) weight.attach(title.querySelectorAll(".char"));
  };

  // The deck's transition context → anim.js opts / own clip leads. Absent ctx
  // falls back to the deck's ui.trans / ui.persist (as anim.js does).
  const ctxOpts = (ctx) => (ctx ? { leads: ctx.leads, persist: ctx.persist } : {});
  const leadsOf = (ctx) => (ctx && ctx.leads) || ui.trans || {};

  const anchorInners = () => [
    brand && brand.querySelector(".reveal-inner"),
    locale && locale.querySelector(".reveal-inner"),
    cta && cta.querySelector(".reveal-inner"),
  ];

  // ---- resize re-split (debounced; = Hero) ----
  let resizeTimer = null;
  const onResize = () => {
    if (!active) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const lines = splitTitleIntoLines(title);
      lines.forEach((el) => {
        el.style.opacity = "1";
        el.style.filter = "blur(0)";
        el.style.transform = "none";
      });
      attachWeight();
      reconcile(); // fill any slot the new layout revealed
      // The responsive layout can reveal/hide slots across the 768px
      // breakpoint (or an iPad rotating portrait/landscape); reconcile() just
      // filled the DOM, but yardGL's plane set was snapshotted at mount — re-run
      // build() so it re-syncs to the current live-slot set. Skipped when yardGL
      // is inactive (fallback mode); a request landing mid-build marks it dirty
      // and the in-flight build runs one more pass.
      if (gl && gl.active) Promise.resolve(gl.build()).catch(() => {});
    }, TIMINGS.resizeDebounceMs);
  };

  const bindEnv = () => {
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
  };
  const unbindEnv = () => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onResize);
  };

  // Minimal surface for the dev tooling in src/dev/ (URL overrides, wash panel,
  // glitch-lab roll hook). Never used by production code paths.
  const yardApi = {
    isActive: () => active,
    treatment,
    getWash: wash.getWash,
    setWash: wash.setWash,
    setSwapEffect: roller.setSwapEffect,
    rollNow: () => {
      if (active && !document.hidden) rollOnce();
    },
    onEnterSettled: (fn) => {
      devOnEnterSettled = fn;
    },
    // fn(section) now if mounted, else right after mount().
    whenMounted: (fn) => {
      if (section) fn(section);
      else devMountQueue.push(fn);
    },
  };
  // Only fetch the dev module when a Yard dev param or a dev route is actually present, so a
  // built tree served from a dev host (no src/dev/) never 404s on a normal page load.
  // Glitch-lab / harness hook: tiny and dependency-free, so it is registered eagerly on dev hosts
  // (it used to live in yardParams.js, which now loads only when a Yard dev param is present).
  if (isDevEnabled()) window.addEventListener("yard:roll", () => yardApi.rollNow());
  if (isDevEnabled() && wantsYardDev())
    import("../../dev/yardParams.js").then((m) => m.apply(yardApi)).catch((e) => console.warn("[dev]", e));

  return {
    id: "yard",
    scheme: "light",
    shader: { paused: false, treatment },

    mount(root) {
      section = root;

      // Logo grid — a layer beneath .content (title + anchors sit on top). Its
      // inset (var(--gutter)) matches Figma's 32px margins; slots are absolutely
      // placed within it. Logos cascade in/out per-slot (see cascadeLogos) and
      // the diagonal lines fade with the module (see enter/exit).
      grid = document.createElement("div");
      grid.className = "yard-grid";
      grid.setAttribute("aria-hidden", "true");
      diagEl = buildDiagonals();
      grid.appendChild(diagEl);
      slots.push(...SLOT_CELLS.map(([c, top]) => makeSlot(c, top)));
      slots[0].el.classList.add("y-slot--primary"); // the one shown on mobile
      slots.forEach((s) => grid.appendChild(s.el));

      content = document.createElement("div");
      content.className = "content yard-content";

      title = document.createElement("h2");
      title.className = "title yard-title";
      title.textContent = TITLE_TEXT;

      brand = mkAnchor("y-anchor y-brand", "spendolas", { key: "brand" });
      locale = mkAnchor("y-anchor y-locale", "barcelona and worldwide", { key: "locale" });
      cta = mkAnchor("y-anchor y-cta", "request a quote", { key: "cta", link: true });

      content.append(grid, title, brand, locale, cta);
      section.append(content);

      // A11y: the logo wall is aria-hidden; expose brand names as a visually-hidden list.
      const names = document.createElement("ul");
      names.setAttribute(
        "style",
        "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;list-style:none;"
      );
      BRANDS.forEach((b) => {
        const li = document.createElement("li");
        li.textContent = b.name;
        names.appendChild(li);
      });
      section.append(names);

      // Dev hooks that arrived before mount (src/dev/yardParams.js).
      devMountQueue.splice(0).forEach((fn) => fn(section));
    },

    enter(direction, ctx) {
      active = true;
      roller.setActive(true);
      const lines = splitTitleIntoLines(title);
      title.style.opacity = "1";
      attachWeight();
      weight.bind();
      bindEnv();

      // Fill the wall, then cascade the logos + diagonals in with the entry.
      reconcile();
      // Mount the WebGL mirror now that reconcile() has created the DOM logos to
      // rasterise. Fire-and-forget: mount() is async + self-guarding, and enter()
      // must still return the entrance `done` promise unreordered. A rejected
      // mount must not surface as an unhandled rejection.
      if (gl.active) {
        // Quick return: the previous exit's deferred unmount was skipped, so the
        // wall is still mounted and mount() would no-op. Resync its planes and
        // textures to the DOM instead — after any swap still in flight from the
        // last visit has settled, so the rebuild rasterises the final brand.
        Promise.all(Array.from(pendingSwaps))
          .then(() => {
            if (active && gl.active) return gl.build();
          })
          .catch(() => {});
      } else {
        Promise.resolve(gl.mount()).catch(() => {});
      }
      if (diagFade) diagFade.cancel();
      diagFade = null;
      // Hairlines are display:none on mobile — don't animate a hidden element.
      if (!isMobileLayout() && diagEl) {
        diagFade = diagEl.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: TIMINGS.hairlineFadeMs,
          delay: leadsOf(ctx).hairline || 0,
          easing: SNAP,
          fill: "both",
        });
      }
      cascadeLogos("in", direction !== "up");

      const done = enterModule(lines, anchorInners(), direction, ctxOpts(ctx));
      done.then(() => {
        if (!active) return;
        weight.refresh();
        reconcile();
        startRolling();
        if (devOnEnterSettled) devOnEnterSettled(); // dev wash panel readout
      }).catch(() => {});
      return done;
    },

    exit(direction, ctx) {
      stopRolling();
      // Abort any swap in flight before the cascade starts, so a mid-roll exit
      // never leaves the incoming logo popping back over an exiting wall.
      abortRolls();
      // Mobile's own text-out lead (single fullscreen logo, no wall to wait for)
      // comes from the TRANSITIONS mobile row, resolved by the deck into ctx.leads.
      const lines = title ? Array.from(title.querySelectorAll(".line-inner")) : [];
      const p = exitModule(lines, anchorInners(), direction, ctxOpts(ctx));
      // Cascade the logos out in the same direction they entered (bottom-left
      // first) so the wall streams away with the cascade; fade the diagonals with
      // the module. Wait on the cascade so the section doesn't hide mid-flight.
      const logosOut = cascadeLogos("out", direction !== "up");
      if (diagFade) diagFade.cancel();
      diagFade = null;
      // Hairlines are display:none on mobile — don't animate a hidden element.
      if (!isMobileLayout() && diagEl) {
        diagFade = diagEl.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: TIMINGS.hairlineFadeMs,
          delay: leadsOf(ctx).hairline || 0,
          easing: SNAP,
          fill: "both",
        });
      }
      weight.unbind();
      unbindEnv();
      active = false;
      roller.setActive(false);
      const done = Promise.all([
        p,
        logosOut,
        diagFade ? diagFade.finished.catch(() => {}) : Promise.resolve(),
      ]);
      // Tear the WebGL mirror down only AFTER the exit cascade finishes, so the
      // DOM logos are restored on a settled wall (no seam mid-cascade). The
      // trigger also races TIMINGS.deckGuardMs so a cascade that never settles
      // (e.g. a section hidden mid-flight) cannot strand the canvas. Skip it if
      // a newer exit superseded this one or Yard was re-entered meanwhile. The
      // RETURNED `done` is unchanged.
      const myExit = ++exitToken;
      // rAF clock, not setTimeout: the harness' protected timer ledger must not
      // gain an entry on every Yard exit.
      const guard = new Promise((res) => {
        const t0 = performance.now();
        const tick = () => (performance.now() - t0 >= TIMINGS.deckGuardMs ? res() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      });
      Promise.race([done, guard])
        .then(() => {
          if (!active && myExit === exitToken) gl.unmount();
        })
        .catch(() => {});
      return done;
    },

    unmount() {
      stopRolling();
      gl.unmount();
      weight.unbind();
      unbindEnv();
      slots.length = 0;
      diagEl = null;
      diagFade = null;
      if (section) section.innerHTML = "";
    },
  };
}
