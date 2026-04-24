#!/usr/bin/env bash
set -e
# shellcheck disable=SC1091
[ -f .exocore-bootstrap.sh ] && . ./.exocore-bootstrap.sh || true

echo "[Exocore] Checking Bun runtime (preferred for Hono)..."
if exo_ensure_bun; then
    echo "[Exocore] Bun detected: $(bun --version)"
    [ -f package.json ] && bun install || true
else
    echo "[Exocore] Bun unavailable — falling back to Node.js + tsx..."
    exo_ensure_node || { echo "[Exocore] ERROR: Neither Bun nor Node.js available."; exit 1; }
    echo "[Exocore] Node.js: $(node --version)"
    exo_npm_install
fi
echo "[Exocore] Done!"
