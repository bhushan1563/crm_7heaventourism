#!/usr/bin/env bash
# Update the app on the VPS and restart it:   bash deploy/deploy.sh
# Prereqs: Node 20+ and PM2 installed, backend/.env present (see docs/DEPLOYMENT.md).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -d .git ]; then
  git pull --ff-only
fi

npm ci          # installs both workspaces from the single root lockfile
npm run build   # builds frontend/dist, which the API then serves

pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save
echo "Deployed. Check: curl -s http://127.0.0.1:\${PORT:-5000}/api/health"
