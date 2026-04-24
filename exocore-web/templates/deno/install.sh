#!/usr/bin/env bash
set -e
# shellcheck disable=SC1091
[ -f .exocore-bootstrap.sh ] && . ./.exocore-bootstrap.sh || true

echo "[Exocore] Checking Deno runtime..."
if exo_ensure_deno; then
    echo "[Exocore] Deno detected: $(deno --version | head -1)"
    if [ -f deno.json ] || [ -f deno.jsonc ]; then
        echo "[Exocore] Caching Deno dependencies..."
        deno cache index.ts 2>/dev/null || true
    fi
else
    echo "[Exocore] WARNING: Deno not available."
fi
echo "[Exocore] Done! Run: deno run -A index.ts"
