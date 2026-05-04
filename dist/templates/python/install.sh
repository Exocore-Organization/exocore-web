#!/usr/bin/env bash
set -e
# shellcheck disable=SC1091
[ -f .exocore-bootstrap.sh ] && . ./.exocore-bootstrap.sh || true

echo "[Exocore] Setting up Python project..."
if ! exo_ensure_python; then
    echo "[Exocore] WARNING: Python not available in this environment."
    echo "[Exocore] Project files are ready. Install Python to run: python3 app.py"
    exit 0
fi
echo "[Exocore] Python detected: $($EXO_PYTHON --version 2>&1)"

PIP=""
if "$EXO_PYTHON" -m pip --version > /dev/null 2>&1; then
    PIP="$EXO_PYTHON -m pip"
elif command -v pip3 > /dev/null 2>&1; then
    PIP="pip3"
elif command -v pip > /dev/null 2>&1; then
    PIP="pip"
fi

if [ -f requirements.txt ] && grep -qvE '^\s*(#|$)' requirements.txt; then
    if [ -n "$PIP" ]; then
        echo "[Exocore] Installing dependencies from requirements.txt..."
        $PIP install --disable-pip-version-check -r requirements.txt \
            || $PIP install --user --disable-pip-version-check -r requirements.txt \
            || $PIP install --break-system-packages --disable-pip-version-check -r requirements.txt \
            || echo "[Exocore] Some packages failed to install."
    else
        echo "[Exocore] WARNING: pip not available; skipping requirements.txt"
    fi
else
    echo "[Exocore] No dependencies to install."
fi

echo "[Exocore] Done! Run: python3 app.py"
