#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Exocore install.sh bootstrap helpers
#
# Sourced from each template's install.sh. Provides cross-distro / cross-host
# helpers so the same install.sh works on:
#
#   * Replit          (Nix:   nix-env)
#   * Hugging Face    (Docker / Debian: apt-get)
#   * Render          (Docker / Debian: apt-get)
#   * Railway         (Docker / Debian: apt-get)
#   * Generic Linux   (apt / yum / dnf / apk / pacman)
#   * macOS           (brew)
#
# Every package install is wrapped in `|| ... || true` so a missing manager
# never aborts the whole script. The user can still run the project even if
# the runtime had to be installed manually.
# ---------------------------------------------------------------------------

# Use sudo only when present and we're not already root.
exo_sudo() {
    if [ "$(id -u 2>/dev/null || echo 0)" = "0" ]; then
        "$@"
    elif command -v sudo > /dev/null 2>&1; then
        sudo "$@"
    else
        "$@"
    fi
}

# Generic package installer. Tries every known package manager in order and
# stops at the first that succeeds. All failures are swallowed so install.sh
# can keep going and surface a clear error later if the runtime is still
# missing.
#
# Usage:  exo_install_pkg <apt-name> [yum-name] [apk-name] [pacman-name] [brew-name] [nix-attr]
#
# If a name is omitted it defaults to the apt name. Pass "-" to skip a manager.
exo_install_pkg() {
    local apt_name="$1"
    local yum_name="${2:-$apt_name}"
    local apk_name="${3:-$apt_name}"
    local pacman_name="${4:-$apt_name}"
    local brew_name="${5:-$apt_name}"
    local nix_attr="${6:-}"

    if command -v apt-get > /dev/null 2>&1 && [ "$apt_name" != "-" ]; then
        exo_sudo apt-get update -qq    > /dev/null 2>&1 || true
        exo_sudo apt-get install -y --no-install-recommends "$apt_name" > /dev/null 2>&1 && return 0
    fi
    if command -v dnf > /dev/null 2>&1 && [ "$yum_name" != "-" ]; then
        exo_sudo dnf install -y "$yum_name" > /dev/null 2>&1 && return 0
    fi
    if command -v yum > /dev/null 2>&1 && [ "$yum_name" != "-" ]; then
        exo_sudo yum install -y "$yum_name" > /dev/null 2>&1 && return 0
    fi
    if command -v apk > /dev/null 2>&1 && [ "$apk_name" != "-" ]; then
        exo_sudo apk add --no-cache "$apk_name" > /dev/null 2>&1 && return 0
    fi
    if command -v pacman > /dev/null 2>&1 && [ "$pacman_name" != "-" ]; then
        exo_sudo pacman -Sy --noconfirm "$pacman_name" > /dev/null 2>&1 && return 0
    fi
    if command -v brew > /dev/null 2>&1 && [ "$brew_name" != "-" ]; then
        brew install "$brew_name" > /dev/null 2>&1 && return 0
    fi
    if command -v nix-env > /dev/null 2>&1 && [ -n "$nix_attr" ]; then
        nix-env -iA "nixpkgs.$nix_attr" > /dev/null 2>&1 && return 0
    fi
    return 1
}

# Add a directory to PATH (no duplicates).
exo_path_add() {
    case ":$PATH:" in
        *":$1:"*) : ;;
        *) export PATH="$1:$PATH" ;;
    esac
}

# ---------------------------------------------------------------------------
# Runtime ensure helpers — each tries every known install path.
# ---------------------------------------------------------------------------

exo_ensure_node() {
    if command -v node > /dev/null 2>&1; then return 0; fi
    echo "[Exocore] Node.js not found — installing…"
    exo_install_pkg nodejs nodejs nodejs nodejs node nodejs_20 \
        || exo_install_pkg nodejs nodejs nodejs nodejs node nodejs \
        || true
    if command -v node > /dev/null 2>&1; then return 0; fi
    # Fallback: official NodeSource / nvm-style installer via curl.
    if command -v curl > /dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | exo_sudo bash - > /dev/null 2>&1 \
            && exo_sudo apt-get install -y nodejs > /dev/null 2>&1 || true
    fi
    command -v node > /dev/null 2>&1
}

exo_ensure_python() {
    for cmd in python3 python python3.12 python3.11 python3.10; do
        if command -v "$cmd" > /dev/null 2>&1; then export EXO_PYTHON=$(command -v "$cmd"); return 0; fi
    done
    echo "[Exocore] Python not found — installing…"
    exo_install_pkg python3 python3 python3 python python3 python311 \
        || exo_install_pkg python3 python3 python3 python python3 python3 \
        || true
    exo_install_pkg python3-pip python3-pip py3-pip python-pip python python311Packages.pip \
        || true
    for cmd in python3.11 python3 python; do
        if command -v "$cmd" > /dev/null 2>&1; then export EXO_PYTHON=$(command -v "$cmd"); return 0; fi
    done
    return 1
}

exo_ensure_gcc() {
    if command -v gcc > /dev/null 2>&1 || command -v cc > /dev/null 2>&1 || command -v clang > /dev/null 2>&1; then return 0; fi
    echo "[Exocore] C compiler not found — installing…"
    exo_install_pkg build-essential gcc build-base base-devel gcc gcc \
        || exo_install_pkg gcc gcc gcc gcc gcc gcc \
        || true
    command -v gcc > /dev/null 2>&1 || command -v cc > /dev/null 2>&1 || command -v clang > /dev/null 2>&1
}

exo_ensure_gpp() {
    if command -v g++ > /dev/null 2>&1 || command -v c++ > /dev/null 2>&1 || command -v clang++ > /dev/null 2>&1; then return 0; fi
    echo "[Exocore] C++ compiler not found — installing…"
    exo_install_pkg g++ gcc-c++ g++ gcc gcc gcc \
        || exo_install_pkg build-essential gcc-c++ build-base base-devel gcc gcc \
        || true
    command -v g++ > /dev/null 2>&1 || command -v c++ > /dev/null 2>&1 || command -v clang++ > /dev/null 2>&1
}

exo_ensure_php() {
    if command -v php > /dev/null 2>&1; then return 0; fi
    echo "[Exocore] PHP not found — installing…"
    exo_install_pkg php-cli php-cli php php php php83 \
        || exo_install_pkg php php php php php php \
        || true
    command -v php > /dev/null 2>&1
}

exo_ensure_rust() {
    if command -v cargo > /dev/null 2>&1; then return 0; fi
    echo "[Exocore] Rust toolchain not found — installing via rustup…"
    exo_install_pkg rustc rust rust rust rust rustc || true
    if command -v cargo > /dev/null 2>&1; then return 0; fi
    if command -v curl > /dev/null 2>&1; then
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
            | sh -s -- -y --no-modify-path > /dev/null 2>&1 || true
        exo_path_add "$HOME/.cargo/bin"
    fi
    command -v cargo > /dev/null 2>&1
}

exo_ensure_dotnet() {
    if command -v dotnet > /dev/null 2>&1; then return 0; fi
    echo "[Exocore] .NET SDK not found — installing…"
    exo_install_pkg dotnet-sdk-8.0 dotnet-sdk-8.0 dotnet8-sdk dotnet-sdk dotnet dotnet-sdk_8 \
        || true
    if command -v dotnet > /dev/null 2>&1; then return 0; fi
    if command -v curl > /dev/null 2>&1; then
        export DOTNET_ROOT="$HOME/.dotnet"
        mkdir -p "$DOTNET_ROOT"
        curl -fsSL https://dot.net/v1/dotnet-install.sh \
            | bash -s -- --channel 8.0 --install-dir "$DOTNET_ROOT" --no-path > /dev/null 2>&1 || true
        exo_path_add "$DOTNET_ROOT"
    fi
    command -v dotnet > /dev/null 2>&1
}

exo_ensure_bun() {
    if command -v bun > /dev/null 2>&1; then return 0; fi
    echo "[Exocore] Bun not found — installing…"
    exo_install_pkg bun bun bun bun bun "" || true
    if command -v bun > /dev/null 2>&1; then return 0; fi
    if command -v curl > /dev/null 2>&1; then
        curl -fsSL https://bun.sh/install | bash > /dev/null 2>&1 || true
        export BUN_INSTALL="$HOME/.bun"
        exo_path_add "$BUN_INSTALL/bin"
    fi
    command -v bun > /dev/null 2>&1
}

exo_ensure_deno() {
    if command -v deno > /dev/null 2>&1; then return 0; fi
    echo "[Exocore] Deno not found — installing…"
    exo_install_pkg deno deno deno deno deno deno || true
    if command -v deno > /dev/null 2>&1; then return 0; fi
    if command -v curl > /dev/null 2>&1; then
        curl -fsSL https://deno.land/install.sh | sh > /dev/null 2>&1 || true
        export DENO_INSTALL="$HOME/.deno"
        exo_path_add "$DENO_INSTALL/bin"
    fi
    command -v deno > /dev/null 2>&1
}

exo_ensure_git() {
    if command -v git > /dev/null 2>&1; then return 0; fi
    exo_install_pkg git git git git git git || true
    command -v git > /dev/null 2>&1
}

exo_ensure_make() {
    if command -v make > /dev/null 2>&1; then return 0; fi
    exo_install_pkg make make make make make gnumake || true
    command -v make > /dev/null 2>&1
}

exo_ensure_cmake() {
    if command -v cmake > /dev/null 2>&1; then return 0; fi
    exo_install_pkg cmake cmake cmake cmake cmake cmake || true
    command -v cmake > /dev/null 2>&1
}

# Shared, polite npm install — same flags everywhere.
exo_npm_install() {
    if [ -f package.json ]; then
        npm install --prefer-offline --no-audit --no-fund --loglevel=http "$@"
    fi
}
