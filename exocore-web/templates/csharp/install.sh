#!/usr/bin/env bash
set -e
# shellcheck disable=SC1091
[ -f .exocore-bootstrap.sh ] && . ./.exocore-bootstrap.sh || true

echo "[Exocore] Checking .NET runtime..."
if exo_ensure_dotnet; then
    DOTNET=$(command -v dotnet)
    echo "[Exocore] .NET detected: $($DOTNET --version 2>/dev/null || echo installed)"
    echo "[Exocore] Building C# project..."
    "$DOTNET" build --nologo -v q 2>/dev/null || true
else
    echo "[Exocore] WARNING: .NET install failed. Install manually from https://dotnet.microsoft.com"
fi
echo "[Exocore] Done! Run: dotnet run"
