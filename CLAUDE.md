# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Agent Handoff

## Project Purpose
- Single-page marketing site for `spendolas.com` (live at https://www.spendolas.com/).
- Fullscreen generative background using spectraGL (naughtyduk) + Three.js, with a typographic foreground UI layered on top.
- spectraGL is forked/extended in `src/spectraGL-noisekit.js` to add pixel‑mode “field” controls.
- No build tooling beyond a minify step (terser via `npx`); no package.json, no test suite. Everything runs as plain ES modules + a global Three.js script in the browser.

## Branching / Workflow
- `fork` = development branch (work in `src/`).
- `main` = release/GitHub Pages branch (root contains only runtime files).
- Release build produces minified assets in `dist/` and publishes to `main`.

## Release Steps
1) Work on `fork` in `src/`.
2) Run `scripts/release.sh` to rebuild `dist/` (minifies `src/spectraGL-noisekit.js`, copies the rest, and rewrites `dist/index.html` to point at the `.min.js` file). Useful for previewing the production bundle locally.
3) Run `scripts/publish_release.sh` to publish to `main` (commits + pushes).

Important nuances:
- `publish_release.sh` regenerates the dist build itself (into a temp dir, from `fork`) and rsyncs it onto `main` — so running `release.sh` first is optional for publishing; it only matters when you want to inspect `dist/` on `fork`.
- `publish_release.sh` requires a clean working tree, briefly checks out `fork` then `main`, and returns you to your starting branch when done.
- Only `spectraGL-noisekit.js` is minified. `index.html`, `main.js`, and `presets.js` are copied verbatim — the inline `<script>` in `index.html` ships unminified.

## Repo Layout
- `src/` (editable sources)
  - `src/index.html` (loads `spectraGL-noisekit.js` and `main.js` as a module)
  - `src/main.js`
  - `src/presets.js`
  - `src/spectraGL-noisekit.js` (unminified library fork)
- `dist/` (release output)
  - `dist/index.html` (loads `spectraGL-noisekit.min.js` and `main.js` as a module)
  - `dist/main.js`
  - `dist/presets.js`
  - `dist/spectraGL-noisekit.min.js`
  - `dist/CNAME`
- `scripts/`
  - `scripts/release.sh`
  - `scripts/publish_release.sh`

## Local Dev
- Use VS Code Live Server.
- Open `src/index.html`.
- Runtime options live in `src/main.js` and `src/presets.js`.

## SpectraGL Customizations (Pixel Mode Only)
- Pixel mode shader + JS wiring were modified in `src/spectraGL-noisekit.js`.
- Added `field` options:
  - `noiseType`: `value` | `simplex` | `worley` | `box`
  - `fractalType`: `none` | `fbm` | `turbulence` | `ridged`
  - `octaves`, `lacunarity`, `gain`, `warpStrength`, `seed`, `flow`, `angle`
  - `min`/`max` remap (smoothstep post‑clamp)
  - `debug` modes `0..4`
- Wiring points:
  - New uniforms in pixel `ShaderMaterial` (plus `updateOptions` mapping).
  - Pixel fragment shader uses `baseNoise` selector + fractal transforms + debug views.
- Debug modes:
  - `1`: field grayscale
  - `2`: warp magnitude grayscale
  - `3`: raw noise grayscale
  - `4`: palette‑only (no dither/masks)
- Caveat: worley/ridged can feel “fast”; keep `speed`/`flow` small when dialing it in.

## Presets + Palettes System
- `src/presets.js` exports:
  - `PRESETS`: partial option overrides merged into `DEFAULT_OPTIONS` via deep merge.
  - `PALETTES`: palette‑only overrides (`colors`, `colorBlend`, `colorBalance`).
- Selection is random (no URL parameters).
- Keys in `src/main.js` (modifier combos with meta/ctrl/alt are ignored):
  - `R`: reroll preset + palette (new random seed)
  - `P`: reroll palette only (keeps current field seed)
  - `O`: reroll preset only (new random seed)
- The large preset-label overlay element is created in `main.js` but is **not currently toggleable** — `showPresetLabel` is declared and never flipped, and its `mixBlendMode` line is commented out. There is no working `Q` handler today; treat the label as effectively disabled.

## Foreground UI Layer (inline in `src/index.html`)
The foreground is a self-contained IIFE in `index.html`'s trailing `<script>` — independent of `main.js`/spectraGL. Editing copy or motion happens here, not in the modules.
- **Title split + reveal**: `splitTitleIntoLines()` measures the rendered `.title` with `Range.getBoundingClientRect()` to group words into visual lines, then wraps each character in `.char` spans. `startReveal()` staggers a blur/translate entrance across lines + the brand/locale/cta. Reveal waits on `document.fonts.ready` (with a 4s fallback) so line breaks are measured against the loaded variable font.
- **Cursor variable-weight effect**: on `pointermove`, characters within `--pointer-radius` of the cursor interpolate `font-weight` `400→700` via a hand-rolled cubic-bezier (`easeBezier`, intentionally undershoots below 400). Weights are applied in a `requestAnimationFrame` against a cached char-position list (`rebuildCharCache`), which must be rebuilt after reveal completes and after resize.
- **Helper overlay**: backtick key (`` ` ``) toggles a half-masked radial gradient that visualizes the bezier falloff under the cursor. This is the only foreground keyboard shortcut.
- **Idle dimming**: after `IDLE_MS` (10s) of no interaction the `.content` layer fades to 5% opacity; any input wakes it. Paused while the tab is hidden.
- **Reduced motion**: `prefers-reduced-motion` short-circuits the weight effect.
- **Resize**: the title is re-split and char cache rebuilt (debounced) so line grouping stays correct.
- **Email obfuscation**: the CTA `mailto:` is assembled from `data-u`/`data-d` on click rather than hardcoded.

## Design Reference
- `DESIGN.md` is the source-of-truth spec for tokens, motion timing, and interaction patterns — consult it before changing visual/motion behavior.
- `ENCRYPTED_VIDEO_GATE_SPEC.md` is a spec for unbuilt/in-progress functionality (not wired into the live site); treat it as a proposal, not current behavior.

## Privacy / Git Identity
- Git author should use handle + GitHub no‑reply email.
- Check:
  - `git config --global --get user.name`
  - `git config --global --get user.email`
- Set:
  - `git config --global user.name "spendolas"`
  - `git config --global user.email "172791200+spendolas@users.noreply.github.com"`
