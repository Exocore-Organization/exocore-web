#!/usr/bin/env bash
set -e
# shellcheck disable=SC1091
[ -f .exocore-bootstrap.sh ] && . ./.exocore-bootstrap.sh || true

echo "[Exocore] Static HTML project — no installation needed."
echo "[Exocore] Looking for a static file server..."
if command -v npx > /dev/null 2>&1; then
    echo "[Exocore] Done! Run: npx serve -p 3000 -l 0.0.0.0"
elif command -v python3 > /dev/null 2>&1 || exo_ensure_python; then
    echo "[Exocore] Done! Run: python3 -m http.server 3000"
elif exo_ensure_node; then
    npm install -g serve > /dev/null 2>&1 || true
    echo "[Exocore] Done! Run: npx serve -p 3000 -l 0.0.0.0"
else
    echo "[Exocore] Done! Open index.html in your browser."
fi
