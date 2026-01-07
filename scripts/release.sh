#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
SRC_DIR="${SRC_DIR:-$ROOT_DIR/src}"
DIST_DIR="${DIST_DIR:-$ROOT_DIR/dist}"

if [ ! -d "$SRC_DIR" ]; then
  echo "Missing src directory at $SRC_DIR" >&2
  exit 1
fi

if [ ! -f "$SRC_DIR/index.html" ]; then
  echo "Missing $SRC_DIR/index.html" >&2
  exit 1
fi

if [ ! -f "$SRC_DIR/spectraGL-noisekit.pp.js" ]; then
  echo "Missing $SRC_DIR/spectraGL-noisekit.pp.js" >&2
  exit 1
fi

echo "[release] Cleaning dist"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "[release] Copying source files"
cp "$SRC_DIR/index.html" "$DIST_DIR/index.html"
cp "$SRC_DIR/main.js" "$DIST_DIR/main.js"
cp "$SRC_DIR/presets.js" "$DIST_DIR/presets.js"

if [ -f "$ROOT_DIR/CNAME" ]; then
  cp "$ROOT_DIR/CNAME" "$DIST_DIR/CNAME"
fi

MINIFIER=""
if command -v npx >/dev/null 2>&1; then
  MINIFIER="npx --yes terser"
elif command -v terser >/dev/null 2>&1; then
  MINIFIER="terser"
elif command -v uglifyjs >/dev/null 2>&1; then
  MINIFIER="uglifyjs"
else
  echo "No minifier found. Install terser (preferred) or uglifyjs." >&2
  exit 1
fi

echo "[release] Minifying spectraGL-noisekit.pp.js"
if [[ "$MINIFIER" == "uglifyjs" ]]; then
  $MINIFIER "$SRC_DIR/spectraGL-noisekit.pp.js" -c -m -o "$DIST_DIR/spectraGL-noisekit.min.js"
else
  $MINIFIER "$SRC_DIR/spectraGL-noisekit.pp.js" --compress --mangle --output "$DIST_DIR/spectraGL-noisekit.min.js"
fi

echo "[release] Rewriting dist/index.html"
DIST_DIR="$DIST_DIR" python3 - <<'PY'
import os
from pathlib import Path
path = Path(os.environ["DIST_DIR"]) / "index.html"
text = path.read_text()
text = text.replace("spectraGL-noisekit.pp.js", "spectraGL-noisekit.min.js")
if "./main.js" in text and "type=\"module\"" not in text:
    text = text.replace(
        '<script src="./main.js"></script>',
        '<script type="module" src="./main.js"></script>',
    )
path.write_text(text)
PY

echo "[release] Done"
