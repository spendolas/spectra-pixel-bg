// Yard layout: slot placement on the design grid, the logo/slot DOM factories,
// the diagonal accent lines and the mobile-layout test.
//
// Layout (desktop) = Figma "Yard Alt • Desktop": a 4-column staggered masonry
// (alternate columns dropped ~½ cell), the two left columns holding 2 logos and
// the two right columns 3, with the title in the bottom-left. Faint diagonal
// accent lines replace the grid hairlines. Mobile is a single centered logo.

import { mqMobile } from "../../framework/breakpoints.js";

// Staggered slot placement on the design grid (1376×960 at 1440 width). Each
// entry is [col 0–3, topPx] — topPx is the slot's top edge relative to the grid
// area; slots are 344×320, so col→left = col×25%, height = 320/960. Alternate
// columns drop ~160px and slots overflow the grid top/bottom into the gutters
// (matches Figma). Left columns get 2 slots, right columns 3; the title fills
// the bottom-left. Values verified against Figma "Yard Alt • Desktop".
export const GRID_W = 1376;
export const GRID_H = 960;
export const SLOT_H = 320;
export const COL_PCT = 25; // one column = 25% of the grid width
export const SLOT_CELLS = [
  [0, 88], [1, -72], [2, 88], [3, -72],
  [0, 408], [1, 248], [2, 408], [3, 248],
  [2, 728], [3, 568],
];

// Diagonal accent lines (design-grid units): DIAG_COUNT parallel lines, each
// line's bbox top-left stepping by (DIAG_STEP_X, DIAG_STEP_Y) from
// (0, DIAG_TOP); each runs corner-to-corner across a DIAG_RUN × DIAG_RISE box.
export const DIAG_COUNT = 3;
export const DIAG_STEP_X = 344;
export const DIAG_STEP_Y = 160;
export const DIAG_TOP = 8;
export const DIAG_RUN = 1032;
export const DIAG_RISE = 480;

// Mobile layout mirrors the CSS breakpoint (styles @media max-width:768px):
// Yard collapses to a single fullscreen logo, so the cascade takes a distinct
// path (a vertical rise, no diagonal/stagger). Read at call time so resizing the
// dev window re-routes without a reload.
export const isMobileLayout = () => mqMobile().matches;

// One logo element: a fixed-size (Figma-native px) box that centers itself in
// the slot (inset:0 + margin:auto, so an effect's transform never fights the
// centering). Its SVG inherits currentColor from --color-fg.
// .y-logo is the cascade target (WAAPI transforms it); the inner wrapper holds
// the SVG and keeps it centered.
export const makeLogo = (b) => {
  const el = document.createElement("div");
  el.className = "y-logo";
  el.dataset.brand = b.id;
  el.style.width = b.w + "px";
  el.style.height = b.h + "px";
  el.innerHTML = '<span class="y-logo-inner">' + b.svg + "</span>";
  return el;
};

export const makeSlot = (col, topPx) => {
  const el = document.createElement("div");
  el.className = "y-slot";
  // Position via custom props (not `left`/`top` directly) so the mobile media
  // query can override placement — an inline `left` would beat any stylesheet.
  el.style.setProperty("--slot-left", col * COL_PCT + "%");
  el.style.setProperty("--slot-top", (topPx / GRID_H) * 100 + "%");
  // ctrl: the AbortController of this slot's in-flight swap (null when idle).
  return { el, col, topPx, brandId: null, busy: false, ctrl: null };
};

// Three parallel diagonal accent lines (Figma), replacing the grid hairlines.
// Drawn in an SVG whose viewBox is the design grid so they scale with it;
// segments run bottom-left→top-right and clip to the viewBox at the edges.
export const buildDiagonals = () => {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "y-diagonals");
  svg.setAttribute("viewBox", "0 0 " + GRID_W + " " + GRID_H);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  // Each line's bbox top-left steps by (344, 160); line goes corner-to-corner.
  for (let i = 0; i < DIAG_COUNT; i++) {
    const x = DIAG_STEP_X * i;
    const yTop = DIAG_TOP + DIAG_STEP_Y * i;
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", x);
    line.setAttribute("y1", yTop + DIAG_RISE);
    line.setAttribute("x2", x + DIAG_RUN);
    line.setAttribute("y2", yTop);
    line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(line);
  }
  return svg;
};
