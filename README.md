---
title: Exocore IDE
emoji: 🚀
colorFrom: indigo
colorTo: purple
sdk: docker
pinned: false
---

# Exocore Web

A browser-based IDE and developer panel — code editor, terminal, project management, multiplayer collaboration, social features, and cloud integrations. Built with **Deno** + **Express 5**, compiled to a single standalone binary.

## Quick Start

```bash
# Download and run (Linux)
curl -fsSL https://raw.githubusercontent.com/Exocore-Organization/exocore-web/main/linux.sh | bash

# Or build manually:
git clone https://github.com/Exocore-Organization/exocore-web.git
cd exocore-web
deno task compile
./exocore-web
```

Open **http://localhost:8080/exocore** and set up your master account.

## Features

### Editor
- **Dual engine**: Monaco (desktop) + Ace (mobile), split editor pane
- **File operations**: tree browser, CRUD, drag-drop upload, ZIP extract, recursive copy/move, download
- **LSP**: TypeScript diagnostics, completions, hover, go-to-def, formatting, rename, code actions, inlay hints
- **Terminal**: xterm.js PTY (bash/zsh/fish) via Rust helper or node-pty
- **Runtime console**: project process I/O streaming, cloudflare tunnel
- **Package managers**: NPM (search/install/publish), PyPI (install/uninstall), multi-lang dep scanner
- **Project runtime**: start/stop/restart/kill, port collision detection, auto-restart
- **Project templates**: Node.js, TypeScript, Python, static HTML — SSE-streamed creation
- **7 themes**: GitHub Dark, GitHub Light, Dracula, Neo-Brutalism, Cyberpunk, Frutiger Aero, Geometry Dash

### Sidebar Panels
- NPM packages, PyLibs (Python), GitHub source control, Google Drive cloud, Extensions registry

### Bottom Panels
- Console, Terminal, Webview/Preview, Problems/Diagnostics, Virtual Browser (VNC)

### Multiplayer
- Real-time collaborative editing (cursor sharing, file-open notifications, in-room chat)
- Rooms: public/private/PIN-protected, invite-only, ban/kick, max player limits

### Social
- Global chat (reply-to, rate-limited), direct messages (E2EE or plaintext)
- Friends system (requests, suggestions, presence)
- Posts/feed (create, comment, emoji react, admin approve)

### Gamification
- XP system with level-ups and achievements, global leaderboard

### Cloud & Integrations
- **Google Drive**: OAuth device flow, backup/restore projects, full backup
- **GitHub**: OAuth device flow, clone/push/pull/create repos

### Extensions
- `extension.json`-based plugins, official + testing scopes, marketplace via Google Drive

### VNC Remote Desktop
- Xvfb + x11vnc via WebSocket proxy

### Admin
- Role-based (user/admin/owner), ban/unban, mute, audit log, payment management

## Install Options

| Platform | Command |
|----------|---------|
| Linux | `curl -fsSL https://raw.githubusercontent.com/Exocore-Organization/exocore-web/main/linux.sh \| bash` |
| Termux (Android) | `curl -fsSL https://raw.githubusercontent.com/Exocore-Organization/exocore-web/main/termux.sh \| bash` |
| Windows (PowerShell) | `curl -o install.ps1 https://raw.githubusercontent.com/.../install.ps1 && powershell -ExecutionPolicy Bypass -File install.ps1` |
| Windows (CMD) | `curl -o window.bat https://raw.githubusercontent.com/.../window.bat && window.bat` |
| Docker | `docker build -t exocore-web --target run . && docker run -p 8080:8080 exocore-web` |

## Build for Other Platforms

```bash
deno task compile-linux     # x86_64 Linux
deno task compile-mac       # x86_64 macOS
deno task compile-mac-arm   # ARM macOS
deno task compile-win       # x86_64 Windows
```

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Installation Guide](docs/INSTALL.md)
- [Building from Source](docs/BUILD.md)
- [Feature Details](docs/FEATURES.md)

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |

**Dev gate**: Visit `/exocore/dev-gate` on first run to create the master account (`devs.json`).

## License

MIT — Exocore Organization
