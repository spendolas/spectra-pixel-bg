# Agent Handoff

## Project Overview
- This repo hosts a plain HTML spectraGL background demo.
- Development happens on branch `fork` using sources in `src/`.
- Production (GitHub Pages) is served from branch `main` root, containing only release assets.

## Repo Structure
- `src/`: editable sources
  - `src/index.html` (loads `spectraGL-noisekit.pp.js` and `main.js` as module)
  - `src/main.js`
  - `src/presets.js`
  - `src/spectraGL-noisekit.pp.js` (unminified library)
- `dist/`: release assets
  - `dist/index.html` (loads `spectraGL-noisekit.min.js` and `main.js` as module)
  - `dist/main.js`
  - `dist/presets.js`
  - `dist/spectraGL-noisekit.min.js`
  - `dist/CNAME`
- `scripts/`: release tooling
  - `scripts/release.sh`
  - `scripts/publish_release.sh`

## Branching / Workflow
- `fork` is the long‑lived dev branch.
- `main` is release‑only and should contain only the runtime files (no `src/`, no scripts).
- GitHub Pages is configured to serve from `main` root.

## Release Steps
1) Work on `fork` in `src/`.
2) Run `scripts/release.sh` to rebuild `dist/` (minifies `spectraGL-noisekit.pp.js`).
3) Run `scripts/publish_release.sh` to:
   - build release into a temp dir,
   - switch to `main`,
   - replace root files with `dist` contents,
   - commit and push,
   - switch back to `fork`.

## Notes
- `scripts/release.sh` prefers `npx terser` (Node installed via Homebrew). Falls back to `terser` or `uglifyjs` if available.
- The live URL is the custom domain set in `CNAME`.
