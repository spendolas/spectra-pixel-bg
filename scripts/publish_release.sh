#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
DEV_BRANCH="fork"
RELEASE_BRANCH="main"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is dirty. Commit or stash changes first." >&2
  exit 1
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "[publish] Checking out $DEV_BRANCH"
git checkout "$DEV_BRANCH"

TMP_DIST=$(mktemp -d)
trap 'rm -rf "$TMP_DIST"' EXIT

DIST_DIR="$TMP_DIST" "$ROOT_DIR/scripts/release.sh"

echo "[publish] Checking out $RELEASE_BRANCH"
git checkout "$RELEASE_BRANCH"

rsync -a --delete --exclude ".git" "$TMP_DIST/" "$ROOT_DIR/"

if git diff --quiet; then
  echo "[publish] No release changes to commit"
else
  RELEASE_STAMP=$(date -u "+%Y-%m-%d %H:%M:%S UTC")
  git add -A
  git commit -m "Release: $RELEASE_STAMP"
  git push origin "$RELEASE_BRANCH"
fi

echo "[publish] Returning to $CURRENT_BRANCH"
git checkout "$CURRENT_BRANCH"

echo "[publish] Done"
