#!/usr/bin/env bash
set -e
# shellcheck disable=SC1091
[ -f .exocore-bootstrap.sh ] && . ./.exocore-bootstrap.sh || true

echo "[Exocore] Checking C compiler..."
exo_ensure_gcc || { echo "[Exocore] ERROR: No C compiler available."; exit 1; }
GCC=$(command -v gcc 2>/dev/null || command -v cc 2>/dev/null || command -v clang 2>/dev/null)
echo "[Exocore] C compiler: $GCC"

echo "[Exocore] Compiling main.c..."
"$GCC" -o main main.c
echo "[Exocore] Build successful! Run: ./main"
