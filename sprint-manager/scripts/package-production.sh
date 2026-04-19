#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/.deploy"
STAGING_DIR="$OUTPUT_DIR/sprint-board"
ARCHIVE_PATH="$OUTPUT_DIR/sprint-board-production.tar.gz"

cd "$ROOT_DIR"

echo "Building Sprint Board frontend..."
npm run build

echo "Preparing production bundle..."
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR/server/data"

cp -R "$ROOT_DIR/build" "$STAGING_DIR/build"
cp -R "$ROOT_DIR/server/." "$STAGING_DIR/server"
cp "$ROOT_DIR/package.json" "$STAGING_DIR/package.json"
cp "$ROOT_DIR/package-lock.json" "$STAGING_DIR/package-lock.json"
cp "$ROOT_DIR/README.md" "$STAGING_DIR/README.md"
cp "$ROOT_DIR/.env.production.example" "$STAGING_DIR/.env.production.example"

rm -f "$STAGING_DIR/server/data/"*.sqlite "$STAGING_DIR/server/data/"*.sqlite-*

cat > "$STAGING_DIR/DEPLOYMENT.md" <<'EOF'
# Sprint Board Production Bundle

## Requirements

- Node.js 22 or newer

## Run

1. Copy `.env.production.example` to `.env` and fill in the values.
2. Start the app:

```bash
PORT=4000 node server/index.js
```

The server exposes the UI and API from the same process and stores SQLite data at:

`server/data/sprint-board.sqlite`
EOF

rm -f "$ARCHIVE_PATH"
tar -C "$OUTPUT_DIR" -czf "$ARCHIVE_PATH" sprint-board

echo "Production bundle created:"
echo "  $ARCHIVE_PATH"
echo "Staging directory:"
echo "  $STAGING_DIR"
