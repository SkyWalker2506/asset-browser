#!/usr/bin/env bash
# Install asset-browser into a target project.
# Usage: ./install.sh /path/to/project [github-owner/repo]
set -e

TARGET="${1:-}"
REPO_ARG="${2:-}"
[ -z "$TARGET" ] && { echo "Usage: ./install.sh /path/to/project [owner/repo]"; exit 1; }
[ ! -d "$TARGET" ] && { echo "Target dir not found: $TARGET"; exit 1; }

PKG_ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="$TARGET/asset-browser"

mkdir -p "$DEST"/{api,scripts,public,data}

# Copy package code
cp -r "$PKG_ROOT/api/"*.js "$DEST/api/"
cp -r "$PKG_ROOT/scripts/"*.mjs "$DEST/scripts/"
cp "$PKG_ROOT/public/index.html" "$DEST/public/"
cp "$PKG_ROOT/vercel.json" "$DEST/"
cp "$PKG_ROOT/package.json" "$DEST/"
cp "$PKG_ROOT/deploy.sh" "$DEST/"
chmod +x "$DEST/deploy.sh"

# Write config.json if not present
if [ ! -f "$DEST/config.json" ]; then
  PROJECT_NAME="$(basename "$TARGET")"
  OWNER="${REPO_ARG%%/*}"
  REPO="${REPO_ARG##*/}"
  [ -z "$OWNER" ] && OWNER="YOUR_USER"
  [ -z "$REPO" ] && REPO="$PROJECT_NAME"
  cat > "$DEST/config.json" <<EOF
{
  "title": "$PROJECT_NAME",
  "projectRoot": "..",
  "sources": [
    { "dir": "assets", "category": "Assets", "tag": "asset" }
  ],
  "github": { "owner": "$OWNER", "repo": "$REPO", "branch": "main" },
  "uploadPath": "asset-browser/data/uploads"
}
EOF
fi

# Seed missing.json
[ ! -f "$DEST/data/missing.json" ] && echo '{ "updated": "'"$(date +%F)"'", "items": [] }' > "$DEST/data/missing.json"

echo "Installed asset-browser at: $DEST"
echo "Next:"
echo "  1. Edit $DEST/config.json (sources + github)"
echo "  2. cd $DEST && npm run build"
echo "  3. cd $DEST && vercel --prod"
echo "  4. vercel env add GITHUB_TOKEN production"
