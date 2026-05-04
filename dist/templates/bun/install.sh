#!/usr/bin/env bash
set -e
# shellcheck disable=SC1091
[ -f .exocore-bootstrap.sh ] && . ./.exocore-bootstrap.sh || true

echo "[Exocore] Checking Bun runtime..."
if exo_ensure_bun; then
    echo "[Exocore] Bun detected: $(bun --version)"
    [ -f package.json ] && bun install || true
else
    echo "[Exocore] WARNING: Bun install failed. Falling back to Node.js + tsx..."
    if exo_ensure_node; then
        npm install -g tsx > /dev/null 2>&1 || true
    fi
fi
echo "[Exocore] Done! Run: bun run index.ts"
