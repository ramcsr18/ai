#!/usr/bin/env bash

set -euo pipefail

APP_NAME="${APP_NAME:-sprint-board}"
APP_PORT="${PORT:-4000}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found in PATH."
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is required but was not found in PATH."
  echo "Install it with: npm install -g pm2"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Building Sprint Board..."
npm run build

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "Restarting existing pm2 app: $APP_NAME"
  pm2 restart "$APP_NAME" --update-env
else
  echo "Starting pm2 app: $APP_NAME"
  pm2 start server/index.js --name "$APP_NAME" --update-env --time
fi

pm2 save

cat <<EOF

Sprint Board is running in the background with pm2.

App name: $APP_NAME
Port: $APP_PORT

Useful commands:
  pm2 status
  pm2 logs $APP_NAME
  pm2 restart $APP_NAME
  pm2 stop $APP_NAME

To enable startup on boot once per server:
  pm2 startup

EOF
