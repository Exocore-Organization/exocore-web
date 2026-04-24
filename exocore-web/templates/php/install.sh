#!/usr/bin/env bash
set -e
# shellcheck disable=SC1091
[ -f .exocore-bootstrap.sh ] && . ./.exocore-bootstrap.sh || true

echo "[Exocore] Checking PHP runtime..."
if exo_ensure_php; then
    echo "[Exocore] PHP detected: $(php --version | head -1)"
else
    echo "[Exocore] WARNING: PHP not available. Install PHP to run this project."
fi

if [ -f composer.json ]; then
    if command -v composer > /dev/null 2>&1; then
        echo "[Exocore] Installing Composer dependencies..."
        composer install --no-interaction || true
    else
        echo "[Exocore] composer not installed; skipping dependency install."
    fi
fi
echo "[Exocore] Done! Run: php -S 0.0.0.0:3000"
