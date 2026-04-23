#!/usr/bin/env bash
# Update asset-browser code in a project without touching config.json or data/.
# Usage (from package root): ./update.sh /path/to/Project
# Or (from inside a project's asset-browser/): npm run update-code
set -e

TARGET="${1:-}"
[ -z "$TARGET" ] && { echo "Usage: ./update.sh /path/to/project"; exit 1; }

# Resolve PKG_ROOT: either the dir containing this script, or latest from GitHub
PKG_ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="$TARGET/asset-browser"
[ ! -d "$DEST" ] && { echo "Not installed at: $DEST"; exit 1; }

# Pull latest package before copying
(cd "$PKG_ROOT" && git pull --quiet) || true

# Copy ONLY code files — preserve config.json + data/
cp "$PKG_ROOT/api/"*.js "$DEST/api/"
cp "$PKG_ROOT/scripts/"*.mjs "$DEST/scripts/"
cp "$PKG_ROOT/public/index.html" "$DEST/public/"
cp "$PKG_ROOT/vercel.json" "$DEST/"
cp "$PKG_ROOT/package.json" "$DEST/"
cp "$PKG_ROOT/deploy.sh" "$DEST/"
chmod +x "$DEST/deploy.sh"

echo "Updated asset-browser code at: $DEST"
echo "Preserved: config.json, data/missing.json, data/uploads/"
echo ""
echo "Redeploy:"
echo "  cd $DEST && npm run build && vercel --prod --yes --scope skywalker2506s-projects"
