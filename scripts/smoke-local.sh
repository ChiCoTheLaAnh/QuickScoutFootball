#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
BASE_URL="http://127.0.0.1:${PORT}"

npm run build

npx next start -p "$PORT" &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -sf "${BASE_URL}/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

BASE_URL="$BASE_URL" node scripts/smoke-test.mjs
