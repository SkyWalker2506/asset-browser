#!/usr/bin/env bash
# Promote general code fixes from a project back to the package repo.
# Usage: ./contribute.sh /path/to/Project
# Copies ONLY code files (api/, scripts/, public/index.html, vercel.json, package.json)
# NEVER copies: config.json, data/, public/manifest.json, public/assets/, public/uploads/
set -e

TARGET="${1:-}"
[ -z "$TARGET" ] && { echo "Usage: ./contribute.sh /path/to/project"; exit 1; }

PKG_ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$TARGET/asset-browser"
[ ! -d "$SRC" ] && { echo "Not installed at: $SRC"; exit 1; }

echo "Comparing code files (project -> package):"
echo ""

CHANGED=0
copy_if_different() {
  local rel="$1"
  if [ -f "$SRC/$rel" ] && ! diff -q "$SRC/$rel" "$PKG_ROOT/$rel" >/dev/null 2>&1; then
    echo "  [DIFF] $rel"
    diff "$PKG_ROOT/$rel" "$SRC/$rel" | head -20
    echo ""
    cp "$SRC/$rel" "$PKG_ROOT/$rel"
    CHANGED=1
  fi
}

# Code files only
for f in api/upload.js api/delete.js api/_config.js scripts/build-manifest.mjs scripts/copy-assets.mjs public/index.html vercel.json package.json; do
  copy_if_different "$f"
done

if [ $CHANGED -eq 0 ]; then
  echo "No code differences — nothing to contribute."
  exit 0
fi

echo ""
echo "Copied to package. Review and push:"
echo "  cd $PKG_ROOT"
echo "  git diff"
echo "  git add -A && git commit -m 'feat/fix: ...' && git push"
echo ""
echo "Then propagate to other projects:"
echo "  ./update.sh /path/to/OtherProject"
