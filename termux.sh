#!/usr/bin/env bash
set -u

# FIX: Binago ang mga default paths para sa standard Linux distro
PREFIX="${PREFIX:-/usr/local}"
HOME_DIR="${HOME:-~}"
EXOCORE_DIR="${EXOCORE_DIR:-$HOME_DIR/exocore}"
EXOCORE_PORT="${PORT:-5000}"
REPO_URL="https://github.com/Exocore-Organization/exocore-web"

C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_CYAN=$'\033[36m'

log()  { printf "%s[exocore]%s %s\n" "$C_CYAN"   "$C_RESET" "$*"; }
ok()   { printf "%s[ ok  ]%s %s\n"   "$C_GREEN"  "$C_RESET" "$*"; }
warn() { printf "%s[warn ]%s %s\n"   "$C_YELLOW" "$C_RESET" "$*"; }
err()  { printf "%s[error]%s %s\n"   "$C_RED"     "$C_RESET" "$*" >&2; }

banner() {
    log "==========================================="
    log "  EXOCORE — Linux Installer"
    log "  Browser IDE • Standalone binary"
    log "==========================================="
    echo ""
}

# Helper function para awtomatikong mag-install ng packages base sa distro mo
linux_install_pkg() {
    local PKG_NAME="$1"
    if command -v apt-get &>/dev/null; then
        sudo apt-get update && sudo apt-get install -y "$PKG_NAME"
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y "$PKG_NAME"
    elif command -v pacman &>/dev/null; then
        sudo pacman -Sy --noconfirm "$PKG_NAME"
    elif command -v brew &>/dev/null; then
        brew install "$PKG_NAME"
    else
        err "Hindi matukoy ang package manager mo. Paki-install nang manu-mano si: $PKG_NAME"
        exit 1
    fi
}

ensure_git() {
    if ! command -v git &>/dev/null; then
        warn "Git not found. Installing..."
        linux_install_pkg "git"
    fi
}

ensure_lfs() {
    ensure_git
    if ! git lfs version &>/dev/null; then
        warn "Git LFS not found. Installing git-lfs..."
        # Sa ibang distro, kailangan minsan i-setup muna (tulad ng debian/ubuntu)
        linux_install_pkg "git-lfs"
        git lfs install
    fi
}

ensure_deno() {
    if ! command -v deno &>/dev/null; then
        warn "Deno not found. Installing via official shell script..."
        curl -fsSL https://deno.land/x/install/install.sh | sh
        # I-export ang Deno path pansamantala para magamit agad ng script
        export DENO_INSTALL="$HOME/.deno"
        export PATH="$DENO_INSTALL/bin:$PATH"
    fi
    ok "Deno $(deno --version | head -1)"
}

ensure_python() {
    if command -v python3 &>/dev/null; then
        ok "Python $(python3 --version 2>&1 | awk '{print $2}')"
    else
        warn "Installing Python & Build Essential..."
        if command -v apt-get &>/dev/null; then
            sudo apt-get update && sudo apt-get install -y python3 build-essential python3-pip
        else
            linux_install_pkg "python3"
        fi
    fi
}

clone_repo() {
    ensure_lfs
    if [ ! -d "$EXOCORE_DIR" ]; then
        log "Cloning Exocore repository framework..."
        
        # Laktawan muna ang mabigat na binary para mabilis ang unang hatak
        GIT_LFS_SKIP_SMUDGE=1 git clone --progress "$REPO_URL" "$EXOCORE_DIR"
        
        log "Downloading heavy standalone binaries (300MB+)..."
        cd "$EXOCORE_DIR"
        
        # Live progress bar para sa LFS binary download
        git lfs pull
        
        if [ $? -eq 0 ]; then
            ok "Repository and binaries downloaded successfully!"
        else
            err "Failed to download Git LFS files."
            exit 1
        fi
    else
        log "Exocore directory already exists. Checking for missing binaries..."
        cd "$EXOCORE_DIR"
        git lfs pull
    fi
}

install_node_pty() {
    clone_repo
    
    if [ ! -f "$EXOCORE_DIR/node_modules/node-pty" ]; then
        warn "Installing node-pty for full terminal support..."
        cd "$EXOCORE_DIR"
        
        # Siguraduhing may npm na naka-install bago magpatuloy
        if ! command -v npm &>/dev/null; then
            warn "NodeJS/NPM not found. Installing..."
            linux_install_pkg "nodejs"
        fi
        
        npm init -y 2>/dev/null
        npm install node-pty@1.1.0 2>&1 | tail -3
        ok "node-pty installed"
    fi
}

start_binary() {
    cd "$EXOCORE_DIR" || { err "Exocore directory not found: $EXOCORE_DIR"; exit 1; }
    
    if [ ! -f "exocore-ide" ]; then
        err "Binary not found: $EXOCORE_DIR/exocore-ide"
        exit 1
    fi
    
    chmod +x exocore-ide
    
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
        err "Usage: linux.sh [all|install|start|doctor]"
        exit 2
        ;;
esac
