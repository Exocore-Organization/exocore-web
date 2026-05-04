#!/data/data/com.termux/files/usr/bin/env bash
# =============================================================================
# Exocore Web - Termux bootstrap / runner
# =============================================================================
# Always works from $HOME/exocore-web (Termux home = internal storage).
# If launched from /storage/emulated/0/... (sdcard), it copies the project
# to $HOME/exocore-web first then re-executes from there.
# Sdcard cannot host symlinks, so npm ALWAYS fails there with EACCES.
#
# dist/ is pre-built — no vite/tsc needed.
# Start command: node dist/index.js
#
# Sub-commands:
#   bash termux.sh                  # full: copy → install → fix-pty → start
#   bash termux.sh install          # copy + npm install only
#   bash termux.sh start            # start server only
#   bash termux.sh fix-pty          # patch + rebuild node-pty (terminal fix)
#   bash termux.sh clean            # wipe node_modules + lockfile
#   bash termux.sh update           # git pull + restart
#   bash termux.sh doctor           # print environment info
# =============================================================================

set -u

# ── Colors ───────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
    C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
    C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
    C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_CYAN=$'\033[36m'
else
    C_RESET=""; C_BOLD=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_CYAN=""
fi
log()  { printf "%s[exocore]%s %s\n" "$C_CYAN"   "$C_RESET" "$*"; }
ok()   { printf "%s[ ok  ]%s %s\n"   "$C_GREEN"  "$C_RESET" "$*"; }
warn() { printf "%s[warn ]%s %s\n"   "$C_YELLOW" "$C_RESET" "$*"; }
err()  { printf "%s[error]%s %s\n"   "$C_RED"    "$C_RESET" "$*" >&2; }
hr()   { printf "%s%s%s\n" "$C_BLUE" "------------------------------------------------------------" "$C_RESET"; }

banner() {
    hr
    printf "%s  EXOCORE WEB — Termux Installer%s\n" "$C_BOLD$C_CYAN" "$C_RESET"
    printf "  Browser IDE • node dist/index.js\n"
    hr
    echo ""
}

# ── Env ───────────────────────────────────────────────────────────────────────
IS_TERMUX=0
[ -d "/data/data/com.termux/files/usr" ] && IS_TERMUX=1
PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
HOME_DIR="${HOME:-/data/data/com.termux/files/home}"

# Target always inside Termux home (no sdcard symlink issues)
WORKDIR="$HOME_DIR/exocore-web"
REPO_URL="${REPO_URL:-https://github.com/your-org/exocore}"
BRANCH="${BRANCH:-main}"
EXOCORE_PORT="${PORT:-5000}"

# ── Detect sdcard path ────────────────────────────────────────────────────────
is_sdcard_path() {
    case "$1" in
        /storage/*|/sdcard/*|/mnt/sdcard/*|/mnt/runtime/*) return 0 ;;
        *) return 1 ;;
    esac
}

# ── Copy from sdcard to home if needed ───────────────────────────────────────
copy_to_home_if_needed() {
    local cwd; cwd="$(pwd -P 2>/dev/null || pwd)"

    # Already in the right place
    [ "$cwd" = "$WORKDIR" ] && return 0

    if is_sdcard_path "$cwd"; then
        log "Source is on shared storage (sdcard): $cwd"
        log "Copying to Termux home: $WORKDIR  (symlinks not supported on sdcard)"
        mkdir -p "$WORKDIR"
        (cd "$cwd" && tar \
            --exclude='./node_modules' \
            --exclude='./.git' \
            --exclude='./build' \
            -cf - .) \
          | (cd "$WORKDIR" && tar -xf -)
        ok "Copied. Re-launching from $WORKDIR ..."
        cd "$WORKDIR" || exit 1
        exec bash "$WORKDIR/termux.sh" "${REMAINING_ARGS[@]:-}"
    fi

    # On internal storage but not WORKDIR — use current dir and update WORKDIR
    WORKDIR="$cwd"
}

# ── Termux package install ────────────────────────────────────────────────────
install_termux_pkgs() {
    [ "$IS_TERMUX" -ne 1 ] && return 0
    log "Updating Termux package index..."
    pkg update -y >/dev/null 2>&1 || true
    local pkgs=(nodejs-lts python clang make pkg-config git libandroid-spawn binutils)
    log "Installing packages: ${pkgs[*]}"
    pkg install -y "${pkgs[@]}" || warn "Some packages failed — continuing."
    if ! command -v node >/dev/null 2>&1; then
        err "node not found after install. Aborting."; exit 1
    fi
    ok "node $(node -v)  /  npm $(npm -v)"
}

# ── Clone or update repo ──────────────────────────────────────────────────────
fetch_repo() {
    if [ -d "$WORKDIR/.git" ]; then
        log "Updating existing repo at $WORKDIR..."
        git -C "$WORKDIR" pull --ff-only origin "$BRANCH"
    elif [ -f "$WORKDIR/dist/index.js" ]; then
        log "dist/index.js already present — skipping clone."
    else
        log "Cloning Exocore to $WORKDIR..."
        git clone --depth=1 --branch "$BRANCH" "$REPO_URL" "$WORKDIR"
    fi
    ok "Source at $WORKDIR"
}

# ── Write .npmrc ──────────────────────────────────────────────────────────────
write_npmrc() {
    local rc="$WORKDIR/.npmrc"
    log "Writing $rc"
    cat > "$rc" <<'EOF'
legacy-peer-deps=true
fund=false
audit=false
loglevel=warn
EOF
}

# ── Export build env for native compiles ──────────────────────────────────────
export_build_env() {
    export ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$PREFIX}"
    export ANDROID_NDK_PATH="${ANDROID_NDK_PATH:-$PREFIX}"
    export GYP_DEFINES="android_ndk_path=$PREFIX OS=android"
    export PYTHON="${PYTHON:-$(command -v python3 || command -v python || true)}"
    export CC="${CC:-clang}"
    export CXX="${CXX:-clang++}"
    export LD="${LD:-clang++}"
    export PUPPETEER_SKIP_DOWNLOAD=1
    export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
}

# ── npm install ───────────────────────────────────────────────────────────────
npm_install() {
    cd "$WORKDIR" || { err "Missing $WORKDIR"; exit 1; }

    # Phase 1: install production deps without running native build scripts
    # so a broken node-pty doesn't abort the whole install.
    log "Phase 1: npm install (skipping native build scripts)..."
    if ! npm install --omit=dev --legacy-peer-deps --ignore-scripts \
                     --no-audit --no-fund; then
        err "npm install failed. Aborting."; exit 1
    fi
    ok "Phase 1 done."

    # Phase 2: build node-pty natively (best-effort — server runs without it).
    log "Phase 2: building node-pty for Termux..."
    if fix_node_pty; then
        ok "node-pty native build OK — interactive terminal will work."
    else
        warn "node-pty native build failed — terminal shows 'unavailable'."
        warn "  Build log: /tmp/exocore-pty-build.log"
        warn "  Retry later:  bash termux.sh fix-pty"
    fi
}

# ── node-pty patch + rebuild for Termux ──────────────────────────────────────
# Fixes: gyp: Undefined variable android_ndk_path in binding.gyp
fix_node_pty() {
    local pty="$WORKDIR/node_modules/node-pty"
    if [ ! -d "$pty" ]; then warn "node-pty not installed — skipping."; return 1; fi

    local gyp="$pty/binding.gyp"
    if [ ! -f "$gyp" ]; then warn "$gyp not found — skipping."; return 1; fi

    # Backup original only once
    [ -f "$gyp.orig" ] || cp "$gyp" "$gyp.orig"

    log "Patching $gyp ..."
    PREFIX="$PREFIX" python3 - "$gyp" <<'PYEOF' || { warn "patch failed"; return 1; }
import sys, re, io, os
path   = sys.argv[1]
prefix = os.environ.get("PREFIX", "/data/data/com.termux/files/usr")
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()
src = src.replace("<(android_ndk_path)", prefix)
if "android_ndk_path%" not in src:
    inject = (
        "{\n"
        "  'variables': {\n"
        "    'android_ndk_path%': '" + prefix + "',\n"
        "    'OS%': 'android',\n"
        "  },\n"
    )
    src = re.sub(r"^\s*\{\s*", inject, src, count=1)
with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print("patched ok")
PYEOF

    log "Rebuilding node-pty with Termux clang..."
    (
        cd "$pty" || exit 1
        export CC="clang" CXX="clang++" LD="clang++"
        export CFLAGS="${CFLAGS:-} -I$PREFIX/include"
        export CXXFLAGS="${CXXFLAGS:-} -I$PREFIX/include"
        export LDFLAGS="${LDFLAGS:-} -L$PREFIX/lib -landroid-spawn"
        export GYP_DEFINES="android_ndk_path=$PREFIX OS=android"
        export PYTHON="$(command -v python3 || command -v python)"
        local node_gyp="npx --yes node-gyp"
        [ -x "$WORKDIR/node_modules/.bin/node-gyp" ] \
            && node_gyp="$WORKDIR/node_modules/.bin/node-gyp"
        $node_gyp rebuild --verbose 2>&1 | tee /tmp/exocore-pty-build.log
    )
    [ -f "$pty/build/Release/pty.node" ] && return 0
    return 1
}

# ── Create the `exocore` alias ────────────────────────────────────────────────
create_alias() {
    local rc="$HOME_DIR/.bashrc"
    local alias_line="alias exocore='cd $WORKDIR && PORT=$EXOCORE_PORT node dist/index.js'"
    if grep -q "alias exocore=" "$rc" 2>/dev/null; then
        sed -i "s|alias exocore=.*|$alias_line|" "$rc"
    else
        echo "" >> "$rc"
        echo "# Exocore" >> "$rc"
        echo "$alias_line" >> "$rc"
    fi
    ok "Alias added — type 'exocore' to start after reloading shell"
    ok "  Reload now:  source ~/.bashrc"
}

# ── Start server ──────────────────────────────────────────────────────────────
start_server() {
    cd "$WORKDIR" || { err "Missing $WORKDIR"; exit 1; }
    if [ ! -f "dist/index.js" ]; then
        err "dist/index.js not found in $WORKDIR"
        err "Make sure the repo was cloned correctly (dist/ must be committed)."
        exit 1
    fi
    log "Starting Exocore on port $EXOCORE_PORT..."
    hr
    log "Open: http://localhost:$EXOCORE_PORT/exocore"
    hr
    export PORT="$EXOCORE_PORT"
    export NODE_ENV=production
    exec node dist/index.js
}

# ── Clean ─────────────────────────────────────────────────────────────────────
clean_modules() {
    local dir="${WORKDIR:-$(pwd)}"
    log "Removing node_modules and package-lock.json from $dir"
    rm -rf "$dir/node_modules" "$dir/package-lock.json"
    ok "Cleaned."
}

# ── Doctor ────────────────────────────────────────────────────────────────────
doctor() {
    hr
    log "IS_TERMUX  : $IS_TERMUX"
    log "WORKDIR    : $WORKDIR"
    log "PWD        : $(pwd)"
    log "PREFIX     : $PREFIX"
    log "HOME       : $HOME_DIR"
    log "PORT       : $EXOCORE_PORT"
    command -v node    >/dev/null && log "node       : $(node -v)"        || warn "node missing"
    command -v npm     >/dev/null && log "npm        : $(npm -v)"         || warn "npm missing"
    command -v python3 >/dev/null && log "python3    : $(python3 -V 2>&1)"|| warn "python3 missing"
    command -v clang   >/dev/null && log "clang      : $(clang --version | head -n1)" || warn "clang missing"
    command -v git     >/dev/null && log "git        : $(git --version)"  || warn "git missing"
    [ -f "$WORKDIR/dist/index.js" ] && ok "dist/index.js found" || warn "dist/index.js MISSING"
    [ -f "$WORKDIR/node_modules/node-pty/build/Release/pty.node" ] \
        && ok "node-pty native binary found" \
        || warn "node-pty native binary missing (run: bash termux.sh fix-pty)"
    log "GYP_DEFINES: ${GYP_DEFINES:-<unset>}"
    log "PYTHON     : ${PYTHON:-<unset>}"
    hr
}

# ── Argument parsing ──────────────────────────────────────────────────────────
SUBCMD="${1:-all}"
[ -n "${1:-}" ] && shift
REMAINING_ARGS=("$@")

# ── Dispatch ──────────────────────────────────────────────────────────────────
case "$SUBCMD" in
    doctor)
        export_build_env
        doctor
        ;;
    clean)
        clean_modules
        ;;
    install)
        banner
        copy_to_home_if_needed
        install_termux_pkgs
        write_npmrc
        export_build_env
        npm_install
        create_alias
        ok "Install complete. Run:  bash termux.sh start"
        ;;
    start)
        export_build_env
        start_server
        ;;
    update)
        copy_to_home_if_needed
        fetch_repo
        export_build_env
        start_server
        ;;
    fix-pty|pty)
        install_termux_pkgs
        export_build_env
        if fix_node_pty; then
            ok "node-pty fixed. Restart the server to enable the terminal."
        else
            err "node-pty fix failed. See /tmp/exocore-pty-build.log"
            exit 1
        fi
        ;;
    all|"")
        banner
        copy_to_home_if_needed
        install_termux_pkgs
        fetch_repo
        write_npmrc
        export_build_env
        doctor
        npm_install
        create_alias
        start_server
        ;;
    *)
        err "Unknown sub-command: $SUBCMD"
        echo "Usage: bash termux.sh [all|install|start|update|fix-pty|clean|doctor]"
        exit 2
        ;;
esac
