#!/usr/bin/env bash
set -e
# shellcheck disable=SC1091
[ -f .exocore-bootstrap.sh ] && . ./.exocore-bootstrap.sh || true

echo "[Exocore] Checking Node.js runtime..."
exo_ensure_node || { echo "[Exocore] ERROR: Node.js could not be installed."; exit 1; }
echo "[Exocore] Node.js detected: $(node --version)"

if [ -f package.json ]; then
    echo "[Exocore] Installing npm dependencies..."
    exo_npm_install
fi
echo "[Exocore] Done! Run: node index.js"
