#!/usr/bin/env bash
set -e
# shellcheck disable=SC1091
[ -f .exocore-bootstrap.sh ] && . ./.exocore-bootstrap.sh || true

echo "[Exocore] Setting up HolyC development environment..."

echo "[Exocore] Ensuring build tools (git, cmake, make, gcc)..."
exo_ensure_git || true
exo_ensure_cmake || true
exo_ensure_make || true
exo_ensure_gcc || true

echo "[Exocore] Checking for HolyC (hcc/hc) compiler..."
if command -v hcc > /dev/null 2>&1 || command -v hc > /dev/null 2>&1; then
    echo "[Exocore] HolyC compiler already installed. Skipping build."
    exit 0
fi

echo "[Exocore] Compiler not found. Building from source..."
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

if ! git clone --depth 1 https://github.com/Jamesbarford/holyc-lang.git "$TMPDIR/holyc-lang"; then
    echo "[Exocore] ERROR: Could not clone holyc-lang repository."
    exit 1
fi

cd "$TMPDIR/holyc-lang"
echo "[Exocore] Configuring with CMake..."
cmake -S ./src -B ./build -G 'Unix Makefiles' -DCMAKE_BUILD_TYPE=Release

echo "[Exocore] Building HolyC compiler..."
make -C ./build -j"$(nproc 2>/dev/null || echo 2)" || { echo "[Exocore] ERROR: Build failed."; exit 1; }

echo "[Exocore] Installing HolyC compiler..."
exo_sudo make -C ./build install || { echo "[Exocore] ERROR: Installation failed."; exit 1; }
exo_sudo ln -sf /usr/local/bin/hcc /usr/local/bin/hc 2>/dev/null || true

echo ""
echo "=========================================================="
echo " [Exocore] HolyC compiler successfully installed!"
echo " Executable: /usr/local/bin/hcc  (also: hc)"
echo " Run your code with: hc main.HC && ./a.out"
echo "=========================================================="
exit 0
