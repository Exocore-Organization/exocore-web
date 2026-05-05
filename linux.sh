#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#  Exocore — Linux install script
#  Supports: Ubuntu 20.04+, Debian 11+, Fedora 36+, Arch, openSUSE
#
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/your-org/exocore/main/linux.sh | bash
#  or locally:
#    chmod +x linux.sh && ./linux.sh
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

EXOCORE_DIR="${EXOCORE_DIR:-$HOME/.exocore}"
EXOCORE_PORT="${PORT:-5000}"
NODE_MIN=18
REPO_URL="${REPO_URL:-https://github.com/Exocore-Organization/exocore-web}"
BRANCH="${BRANCH:-main}"

# ── color helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GRN='\033[0;32m'; YEL='\033[1;33m'
CYN='\033[0;36m'; BOLD='\033[1m'; RST='\033[0m'
info()  { echo -e "${CYN}[exocore]${RST} $*"; }
ok()    { echo -e "${GRN}[  ok  ]${RST} $*"; }
warn()  { echo -e "${YEL}[ warn ]${RST} $*"; }
die()   { echo -e "${RED}[ fail ]${RST} $*" >&2; exit 1; }

banner() {
    echo -e "${BOLD}${CYN}"
    echo "  ███████╗██╗  ██╗ ██████╗  ██████╗ ██████╗ ██████╗ ███████╗"
    echo "  ██╔════╝╚██╗██╔╝██╔═══██╗██╔════╝██╔═══██╗██╔══██╗██╔════╝"
    echo "  █████╗   ╚███╔╝ ██║   ██║██║     ██║   ██║██████╔╝█████╗  "
    echo "  ██╔══╝   ██╔██╗ ██║   ██║██║     ██║   ██║██╔══██╗██╔══╝  "
    echo "  ███████╗██╔╝ ██╗╚██████╔╝╚██████╗╚██████╔╝██║  ██║███████╗"
    echo "  ╚══════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝"
    echo -e "${RST}${BOLD}  Browser-based IDE  •  Linux Installer${RST}"
    echo ""
}

# ── detect package manager ───────────────────────────────────────────────────
detect_pkg() {
    if   command -v apt-get &>/dev/null; then echo "apt";
    elif command -v dnf     &>/dev/null; then echo "dnf";
    elif command -v pacman  &>/dev/null; then echo "pacman";
    elif command -v zypper  &>/dev/null; then echo "zypper";
    else echo "unknown"; fi
}

install_pkg() {
    local pm; pm=$(detect_pkg)
    case $pm in
        apt)    sudo apt-get update -qq && sudo apt-get install -y "$@" ;;
        dnf)    sudo dnf install -y "$@" ;;
        pacman) sudo pacman -Sy --noconfirm "$@" ;;
        zypper) sudo zypper install -y "$@" ;;
        *)      die "Unsupported package manager. Install manually: $*" ;;
    esac
}

# ── check Node.js ────────────────────────────────────────────────────────────
check_node() {
    if ! command -v node &>/dev/null; then
        warn "Node.js not found. Installing via NodeSource..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null || \
            install_pkg nodejs || die "Failed to install Node.js"
    fi
    local ver
    ver=$(node -e "process.stdout.write(String(process.version.match(/\d+/)[0]))")
    if (( ver < NODE_MIN )); then
        die "Node.js ${NODE_MIN}+ required (found v${ver}). Update via: https://nodejs.org"
    fi
    ok "Node.js $(node --version)"
}

# ── check Git ────────────────────────────────────────────────────────────────
check_git() {
    if ! command -v git &>/dev/null; then
        info "Installing git..."
        install_pkg git
    fi
    ok "git $(git --version | awk '{print $3}')"
}

# ── clone or update ──────────────────────────────────────────────────────────
fetch_repo() {
    if [[ -d "$EXOCORE_DIR/.git" ]]; then
        info "Updating existing installation at $EXOCORE_DIR..."
        git -C "$EXOCORE_DIR" pull --ff-only origin "$BRANCH"
    else
        info "Cloning Exocore to $EXOCORE_DIR..."
        git clone --depth=1 --branch "$BRANCH" "$REPO_URL" "$EXOCORE_DIR"
    fi
    ok "Source at $EXOCORE_DIR"
}

# ── install dependencies ─────────────────────────────────────────────────────
install_deps() {
    info "Installing npm dependencies (this may take a minute)..."
    cd "$EXOCORE_DIR"
    PUPPETEER_SKIP_DOWNLOAD=1 npm install \
        --omit=dev --legacy-peer-deps --no-audit --no-fund \
        2>/dev/null \
        || npm install --omit=dev --legacy-peer-deps --no-audit --no-fund
    ok "Dependencies installed"
}

# ── create systemd service (optional) ───────────────────────────────────────
create_service() {
    if ! command -v systemctl &>/dev/null; then return; fi
    read -r -p "$(echo -e "${YEL}Install as systemd service? [y/N]${RST} ")" ans
    [[ "$ans" =~ ^[Yy]$ ]] || return
    local svc_file="/etc/systemd/system/exocore.service"
    sudo tee "$svc_file" >/dev/null <<EOF
[Unit]
Description=Exocore Browser IDE
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$EXOCORE_DIR
ExecStart=$(command -v node) dist/index.js
Restart=on-failure
RestartSec=5s
Environment=PORT=$EXOCORE_PORT
Environment=NODE_ENV=production
Environment=PUPPETEER_SKIP_DOWNLOAD=1

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable exocore
    sudo systemctl start  exocore
    ok "Service installed: sudo systemctl {start,stop,restart,status} exocore"
}

# ── create launcher script ───────────────────────────────────────────────────
create_launcher() {
    # Pinalitan ang 'exocore' ng 'exocore-ide'
    local bin="$HOME/.local/bin/exocore-ide"
    mkdir -p "$HOME/.local/bin"
    cat > "$bin" <<EOF
#!/usr/bin/env bash
cd "$EXOCORE_DIR"
export PORT="${EXOCORE_PORT}"
export NODE_ENV=production
export PUPPETEER_SKIP_DOWNLOAD=1
exec node dist/index.js "\$@"
EOF
    chmod +x "$bin"
    ok "Launcher: $bin"
    if ! echo "$PATH" | grep -q "$HOME/.local/bin"; then
        warn "Add to your shell rc: export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi
}

# ── print finish banner ──────────────────────────────────────────────────────
finish() {
    echo ""
    echo -e "${GRN}${BOLD}╔══════════════════════════════════════════════╗${RST}"
    echo -e "${GRN}${BOLD}║      Exocore installed successfully!         ║${RST}"
    echo -e "${GRN}${BOLD}╚══════════════════════════════════════════════╝${RST}"
    echo ""
    # In-update ang command na ipapakita pagkatapos ma-install
    echo -e "  Start:     ${BOLD}exocore-ide${RST}"
    echo -e "  Open:      ${CYN}http://localhost:${EXOCORE_PORT}/exocore${RST}"
    echo ""
}

# ── main ─────────────────────────────────────────────────────────────────────
main() {
    banner
    check_git
    check_node
    fetch_repo
    install_deps
    create_launcher
    create_service
    finish
}

main "$@"
