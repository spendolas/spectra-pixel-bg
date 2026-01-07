# Release Workflow

This repo uses a dev branch (`fork`) and a release branch (`main`).

## Development
- Work on `fork` in `src/`.
- Run the site locally from `src/index.html`.

## Release
1) From `fork`, run `scripts/release.sh` to refresh `dist/`.
2) Run `scripts/publish_release.sh` to publish to `main`.
3) GitHub Pages deploys from `main` (root).

Notes:
- `src/` holds editable sources.
- `dist/` holds the production assets.
- `main` contains only the release assets and `CNAME`.
