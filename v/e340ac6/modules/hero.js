// Hero module — the typographic intro. Title split + per-line reveal, idle dim,
// resize re-split, email obfuscation. The cursor variable-weight effect now
// lives in the shared framework controller (charWeight). See DESIGN.md §5/§7/§11.

import { enterModule, exitModule, fadeContentOut, resetContentOpacity } from "../framework/anim.js";
import { createIdleDimmer } from "../framework/idle.js";
import { createCharWeight } from "../framework/charWeight.js";
import { TIMINGS } from "../framework/timings.js";
import { splitTitleIntoLines } from "../framework/titleSplit.js";
import { mkAnchor } from "../framework/anchors.js";

const TITLE_TEXT =
  "A boutique design collective treating digital brands with grace and motion.";

export function createHero() {
  let section, content, title, brand, locale, cta, helper;
  let firstEnter = true;
  let active = false;

  const weight = createCharWeight();

  const attachWeight = () => {
    if (title) weight.attach(title.querySelectorAll(".char"));
  };

  // The deck's transition context → anim.js opts (absent → anim falls back to ui.*).
  const ctxOpts = (ctx) => (ctx ? { leads: ctx.leads, persist: ctx.persist } : {});

  const anchorInners = () => [
    brand && brand.querySelector(".reveal-inner"),
    locale && locale.querySelector(".reveal-inner"),
    cta && cta.querySelector(".reveal-inner"),
  ];

  // ---- idle dim (shared helper; reused by Video) ----
  const idle = createIdleDimmer(() => content);

  // ---- resize re-split (debounced) ----
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
    }, TIMINGS.resizeDebounceMs);
  };

  const bindIdle = () => {
    idle.bind();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
  };
  const unbindIdle = () => {
    idle.unbind();
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onResize);
  };

  return {
    id: "hero",
    scheme: "dark",
    shader: { paused: false, treatment: null },

    mount(root) {
      section = root;
      content = document.createElement("div");
      content.className = "content hero-content";

      title = document.createElement("h1");
      title.className = "title";
      title.textContent = TITLE_TEXT;

      brand = mkAnchor("brand", "spendolas", { key: "brand", tag: "span" });
      locale = mkAnchor("locale", "barcelona and worldwide", { key: "locale", tag: "span" });
      cta = mkAnchor("cta", "request a quote", { key: "cta", link: true });

      helper = document.createElement("div");
      helper.className = "helper";
      helper.setAttribute("aria-hidden", "true");

      content.append(title, brand, locale, cta, helper);
      section.appendChild(content);

      weight.setHelper(helper);
    },

    enter(direction, ctx) {
      active = true;
      resetContentOpacity(content); // clear any leftover idle-exit fade
      const lines = splitTitleIntoLines(title);
      title.style.opacity = "1";
      attachWeight();
      weight.bind();
      bindIdle();

      const lead = firstEnter ? TIMINGS.firstEnterLead : 0;
      firstEnter = false;

      const done = enterModule(lines, anchorInners(), direction, { lead, ...ctxOpts(ctx) });
      done.then(() => {
        if (!active) return;
        weight.refresh();
        idle.arm();
      }).catch(() => {});
      return done;
    },

    exit(direction, ctx) {
      fadeContentOut(content, ctxOpts(ctx)); // if idle-dimmed, fade from current opacity (no jump-to-opaque)
      const lines = title ? Array.from(title.querySelectorAll(".line-inner")) : [];
      const p = exitModule(lines, anchorInners(), direction, ctxOpts(ctx));
      weight.unbind();
      unbindIdle();
      active = false;
      return p;
    },

    unmount() {
      weight.unbind();
      unbindIdle();
      if (section) section.innerHTML = "";
    },
  };
}
