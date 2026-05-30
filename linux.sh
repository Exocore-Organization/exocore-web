#!/usr/bin/env bash
set -euo pipefail

EXOCORE_DIR="${EXOCORE_DIR:-$HOME/exocore}"
EXOCORE_PORT="${PORT:-5000}"

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
    echo "  ╚══════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝"
    echo -e "${RST}${BOLD}  Browser-based IDE  •  Linux Installer${RST}"
    echo ""
}

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

ensure_deno() {
    if ! command -v deno &>/dev/null; then
        warn "Deno not found. Installing..."
        curl -fsSL https://deno.land/install.sh | sh
        export PATH="$HOME/.deno/bin:$PATH"
    fi
    ok "Deno $(deno --version | head -1)"
}

ensure_python() {
    if command -v python3 &>/dev/null; then
        ok "Python $(python3 --version 2>&1 | awk '{print $2}')"
    else
        warn "Python not found. Installing..."
        install_pkg python3 python3-pip python3-venv make gcc
        ok "Python $(python3 --version 2>&1 | awk '{print $2}')"
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

create_launcher() {
    local bin="$HOME/.local/bin/exocore-ide"
    mkdir -p "$HOME/.local/bin"
    cat > "$bin" <<EOF
#!/usr/bin/env bash
export PORT="${EXOCORE_PORT}"
exec "$EXOCORE_DIR/exocore-ide" "\$@"
EOF
    chmod +x "$bin"
    ok "Launcher: $bin  (run: exocore-ide)"
    hash -r 2>/dev/null || true
}

install_service() {
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
ExecStart=$EXOCORE_DIR/exocore-ide
Restart=on-failure
RestartSec=5s
Environment=PORT=$EXOCORE_PORT
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable exocore
    sudo systemctl start  exocore
    ok "Service started: sudo systemctl {start,stop,restart,status} exocore"
}

finish() {
    echo ""
    echo -e "${GRN}${BOLD}╔══════════════════════════════════════════════╗${RST}"
    echo -e "${GRN}${BOLD}║      Exocore installed successfully!         ║${RST}"
    echo -e "${GRN}${BOLD}╚══════════════════════════════════════════════╝${RST}"
    echo ""
    echo -e "  Start:     ${BOLD}exocore-ide${RST}"
    echo -e "  Open:      ${CYN}http://localhost:${EXOCORE_PORT}/exocore${RST}"
    echo ""
}

main() {
    banner
    ensure_deno
    ensure_python
    install_node_pty
    create_launcher
    install_service
    finish
}

main "$@"
