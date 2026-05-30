#!/data/data/com.termux/files/usr/bin/env bash
set -u

PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
HOME_DIR="${HOME:-/data/data/com.termux/files/home}"
EXOCORE_DIR="${EXOCORE_DIR:-$HOME_DIR/exocore}"
EXOCORE_PORT="${PORT:-5000}"

C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_CYAN=$'\033[36m'

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
    if [ ! -f "$EXOCORE_DIR/node_modules/node-pty" ]; then
        warn "Installing node-pty for full terminal support..."
        cd "$EXOCORE_DIR"
        npm init -y 2>/dev/null
        npm install node-pty@1.1.0 2>&1 | tail -3
        ok "node-pty installed"
    fi
}

start_binary() {
    cd "$EXOCORE_DIR" || { err "Exocore directory not found: $EXOCORE_DIR"; exit 1; }
    if [ ! -f "exocore-ide" ]; then
        err "Binary not found: $EXOCORE_DIR/exocore-ide"
        err "Place the exocore-ide binary in $EXOCORE_DIR and re-run."
        exit 1
    fi
    export PORT="$EXOCORE_PORT" NODE_ENV=production
    log "Starting on port $EXOCORE_PORT..."
    log "Open: http://localhost:$EXOCORE_PORT/exocore"
    exec ./exocore-ide
}

doctor() {
    echo ""
    log "EXOCORE_DIR : $EXOCORE_DIR"
    log "PORT        : $EXOCORE_PORT"
    command -v deno    >/dev/null && log "deno      : $(deno --version | head -1)" || warn "deno missing"
    command -v python3 >/dev/null && log "python3   : $(python3 -V 2>&1)"      || warn "python3 missing"
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
        install_node_pty
        doctor
        start_binary
        ;;
    *)
        err "Usage: termux.sh [all|install|start|doctor]"
        exit 2
        ;;
esac
