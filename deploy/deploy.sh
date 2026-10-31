#!/usr/bin/env bash
# Update a running server to the latest code and reload it with no manual steps:   bash deploy/deploy.sh
# Run it as the app user (the one PM2 runs the app as). Prereqs: Node 20+, PM2, backend/.env  (see docs/DEPLOYMENT.md).
#   SKIP_TESTS=1 bash deploy/deploy.sh      skip the (database-free, ~10 s) test run
set -Eeuo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n==> %s\n' "$*"; }

if [ -d .git ]; then
  step "Pulling the latest code"
  git pull --ff-only
fi

step "Installing dependencies"
npm ci --include=dev   # dev dependencies (Vite) are needed to build the web app, even when NODE_ENV=production

if [ "${SKIP_TESTS:-0}" != "1" ]; then
  step "Running tests (no database needed)"
  npm test
fi

step "Building the web app"
npm run build

step "Reloading the app"
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save >/dev/null

# Port comes from backend/.env (default 5000); the real environment wins if set.
PORT_VALUE="${PORT:-$(grep -E '^PORT=' backend/.env 2>/dev/null | tail -n1 | cut -d= -f2 | tr -d "\"'\r " || true)}"
PORT_VALUE="${PORT_VALUE:-5000}"

step "Checking it came back up (http://127.0.0.1:${PORT_VALUE}/api/health)"
for attempt in $(seq 1 20); do
  # Our app reports the database state; another program answering on this port must not count as success.
  if curl -fsS "http://127.0.0.1:${PORT_VALUE}/api/health" 2>/dev/null | grep -q '"database":"connected"'; then
    echo "Healthy after ${attempt} check(s). Deployed."
    exit 0
  fi
  sleep 2
done

echo "The app did not become healthy within 40 s. Last log lines:" >&2
pm2 logs 7heaven-crm --lines 40 --nostream >&2 || true
exit 1
