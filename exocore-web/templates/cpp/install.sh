#!/usr/bin/env bash
set -e
# shellcheck disable=SC1091
[ -f .exocore-bootstrap.sh ] && . ./.exocore-bootstrap.sh || true

echo "[Exocore] Checking C++ compiler..."
exo_ensure_gpp || { echo "[Exocore] ERROR: No C++ compiler available."; exit 1; }
GPP=$(command -v g++ 2>/dev/null || command -v c++ 2>/dev/null || command -v clang++ 2>/dev/null)
echo "[Exocore] C++ compiler: $GPP"

echo "[Exocore] Compiling main.cpp..."
"$GPP" -o main main.cpp -std=c++17
echo "[Exocore] Build successful! Run: ./main"
