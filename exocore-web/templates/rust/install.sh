#!/usr/bin/env bash
set -e
# shellcheck disable=SC1091
[ -f .exocore-bootstrap.sh ] && . ./.exocore-bootstrap.sh || true

echo "[Exocore] Checking Rust toolchain..."
if exo_ensure_rust; then
    echo "[Exocore] Rust detected: $(rustc --version 2>/dev/null || echo 'cargo only')"
else
    echo "[Exocore] WARNING: Rust not available. Install from https://rustup.rs"
fi
echo "[Exocore] Done! Run: cargo run"
