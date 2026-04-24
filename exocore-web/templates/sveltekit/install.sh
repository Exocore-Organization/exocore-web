#!/usr/bin/env bash
set -e
# shellcheck disable=SC1091
[ -f .exocore-bootstrap.sh ] && . ./.exocore-bootstrap.sh || true

echo "[Exocore] Checking Node.js runtime..."
exo_ensure_node || { echo "[Exocore] ERROR: Node.js could not be installed."; exit 1; }
echo "[Exocore] Node.js: $(node --version)"
echo "[Exocore] Installing SvelteKit dependencies..."
exo_npm_install
echo "[Exocore] Done! Run: npm run dev"
