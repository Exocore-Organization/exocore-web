#!/usr/bin/env bash
set -euo pipefail

EXOCORE_DIR="${EXOCORE_DIR:-$HOME/exocore}"
EXOCORE_PORT="${PORT:-5000}"
REPO_URL="https://github.com/Exocore-Organization/exocore-web"
ARCH=$(uname -m)

C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
C_YELLOW=$'\033[33m'; C_CYAN=$'\033[36m'

log()  { printf "%s[exocore]%s %s\n" "$C_CYAN"   "$C_RESET" "$*"; }
ok()   { printf "%s[ ok  ]%s %s\n"   "$C_GREEN"  "$C_RESET" "$*"; }
warn() { printf "%s[warn ]%s %s\n"   "$C_YELLOW" "$C_RESET" "$*"; }
err()  { printf "%s[error]%s %s\n"   "$C_RED"    "$C_RESET" "$*" >&2; }

banner() {
    log "==========================================="
    log "  EXOCORE — Termux Installer"
    log "  Browser IDE • Standalone binary"
    log "==========================================="
    echo ""
}

ensure_box64() {
    if [ "$ARCH" = "aarch64" ]; then
        if ! command -v box64 &>/dev/null; then
            warn "Box64 not found. Installing..."
            pkg install -y box64
        else
            ok "Box64 found"
        fi
    fi
}

ensure_deno() {
    if ! command -v deno &>/dev/null; then
        warn "Deno not found. Installing..."
        pkg install -y deno
    fi
    ok "Deno $(deno --version | head -1)"
}

ensure_python() {
    if command -v python3 &>/dev/null; then
        ok "Python $(python3 --version 2>&1 | awk '{print $2}')"
    else
        warn "Installing Python..."
        pkg install -y python clang make pkg-config libandroid-spawn binutils
    fi
}

install_node_pty() {
    local nm="$EXOCORE_DIR/node_modules/node-pty"
    if [ ! -f "$nm" ]; then
        warn "Installing node-pty for full terminal support..."
        cd "$EXOCORE_DIR"
        npm init -y 2>/dev/null
        npm install node-pty@1.1.0 2>&1 | tail -3
        ok "node-pty installed"
    fi
}

start_binary() {
    cd "$EXOCORE_DIR" 2>/dev/null || { err "Directory not found: $EXOCORE_DIR"; exit 1; }

    if [ ! -f "exocore-ide" ]; then
        err "Binary not found: $EXOCORE_DIR/exocore-ide"
        exit 1
    fi

    chmod +x exocore-ide
    export PORT="$EXOCORE_PORT" NODE_ENV=production

    log "Starting on port $EXOCORE_PORT..."
    log "Open: http://localhost:$EXOCORE_PORT/exocore"

    if [ "$ARCH" = "aarch64" ]; then
        export BOX64_DYNAREC_FASTMEM=0
        export BOX64_DYNAREC_STRONGMEM=1
        export BOX64_DYNAREC_SAFEFLAGS=1
        log "ARM64 detected — using box64 with V8 trap handler fixes"
        exec box64 ./exocore-ide
    else
        exec ./exocore-ide
    fi
}

doctor() {
    echo ""
    log "EXOCORE_DIR : $EXOCORE_DIR"
    log "PORT        : $EXOCORE_PORT"
    log "ARCH        : $ARCH"
    command -v deno    >/dev/null && log "deno      : $(deno --version | head -1)" || warn "deno missing"
    command -v python3 >/dev/null && log "python3   : $(python3 -V 2>&1)"      || warn "python3 missing"
    command -v box64   >/dev/null && log "box64     : found"                   || true
    [ -f "$EXOCORE_DIR/exocore-ide" ] && ok "Binary found" || warn "Binary not found at $EXOCORE_DIR/exocore-ide"
    echo ""
}

SUBCMD="${1:-all}"
case "$SUBCMD" in
    doctor) doctor ;;
    start)  start_binary ;;
    install|all)
        banner
        ensure_deno
        ensure_python
        ensure_box64
        install_node_pty
        doctor
        start_binary
        ;;
    *)
        err "Usage: termux.sh [all|install|start|doctor]"
        exit 2
        ;;
esac