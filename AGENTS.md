# Agent Handoff

## Project Purpose
- Fullscreen generative background using spectraGL (naughtyduk) + Three.js.
- spectraGL is forked/extended in `src/spectraGL-noisekit.js` to add pixel‑mode “field” controls.

## Branching / Workflow
- `fork` = development branch (work in `src/`).
- `main` = release/GitHub Pages branch (root contains only runtime files).
- Release build produces minified assets in `dist/` and publishes to `main`.

## Release Steps
1) Work on `fork` in `src/`.
2) Run `scripts/release.sh` to rebuild `dist/` (minifies `src/spectraGL-noisekit.js`).
3) Run `scripts/publish_release.sh` to publish `dist/` to `main` (commits + pushes).

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
- Keys in `src/main.js`:
  - `R`: reroll preset + palette
  - `P`: reroll palette
  - `O`: reroll preset
  - `Q`: toggle large preset label overlay (blend mode currently disabled in code)

## Privacy / Git Identity
- Git author should use handle + GitHub no‑reply email.
- Check:
  - `git config --global --get user.name`
  - `git config --global --get user.email`
- Set:
  - `git config --global user.name "spendolas"`
  - `git config --global user.email "172791200+spendolas@users.noreply.github.com"`
