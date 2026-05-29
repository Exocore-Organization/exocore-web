# Exocore Web

A next-generation browser-based IDE and developer panel with a built-in social network, gamified XP system, AI agent, multiplayer collaboration, and full project management.

Built with **Deno** and **Express 5** — compiled to a single standalone binary.

## Features

### IDE
- **Dual editors**: Monaco (VS Code) and ACE, toggleable per-project
- **File system**: tree browser, CRUD, drag-drop upload, ZIP extract, recursive copy/move
- **Terminal**: full PTY via xterm.js (bash/zsh/fish) with resize support
- **Runtime console**: project process I/O streaming
- **Language support**: TypeScript, Python, JavaScript, Rust, Go, Java, Ruby, PHP, C/C++, C#, Elixir
- **NPM manager**: search, install, uninstall, publish packages
- **Python (PyLib)**: search PyPI, install to `pylibs/`, manage requirements.txt
- **Dependency scanner**: detect deps for Rust, Go, Ruby, PHP, Java
- **LSP diagnostics**: TypeScript diagnostics via WebSocket or mobile HTTP fallback
- **Code history**: per-file snapshot diffs stored in IndexedDB
- **Command palette** (Ctrl+Shift+P), context menus, code folding, formatting
- **60+ editor themes**

### Social & Community
- **Real-time chat**: global chat with replies, rate-limited
- **Direct messages**: end-to-end encrypted (E2EE) or plaintext
- **Friends system**: requests, suggestions, presence
- **Posts & feed**: create, comment, react (emojis), approve (moderation)
- **User profiles**: avatars, covers, bio, XP level, posts
- **Leaderboard**: gamified XP ranking

### AI
- **AI agent**: chat + tool-use sidebar with multi-provider support
- **Providers**: Gemini API, Anthropic, HuggingFace Spaces
- **Planning & task management**: agent can plan, execute, and report

### Multiplayer
- **Real-time collaboration**: cursor sharing, collaborative editing
- **Rooms**: public/private/PIN-protected, max player limits, invite-only
- **Presence**: online status, room management, ban/kick

### Project Management
- **Templates**: Node.js, TypeScript, Python, static HTML — create projects from templates
- **Runtime**: start/stop/restart/kill with port collision detection
- **Auto-start**: projects can auto-restart on panel boot
- **Cloudflare Tunnel**: public URLs via trycloudflare

### Cloud & Integrations
- **Google Drive**: backup/restore projects, OAuth device flow
- **GitHub**: clone, push, pull, create repos, OAuth device flow
- **VNC remote desktop**: Xvfb + x11vnc via WebSocket proxy

### Extensions
- **Extension system**: load `extension.json`-based extensions from `official/` and `testing/`
- **Marketplace**: install extensions from Google Drive-hosted marketplace
- **Marketplace config**: via Google Drive JSON or folder ID

### Admin & Moderation
- Role-based access (user/admin/owner)
- Ban/unban, mute, role assignment
- User audit log, deduplication
- Payment/subscription management

## Quick Start

### Prerequisites
- **Deno** (v2.x) — [install](https://docs.deno.com/runtime/manual/getting_started/installation)
- **Rust** (optional, for native PTY helper) — [rustup](https://rustup.rs/)

### Install & Run (single command)
```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/Exocore-Organization/exocore-web/main/linux.sh | bash

# Windows (PowerShell)
curl -o install.ps1 https://raw.githubusercontent.com/Exocore-Organization/exocore-web/main/install.ps1
powershell -ExecutionPolicy Bypass -File install.ps1

# Windows (CMD)
curl -o window.bat https://raw.githubusercontent.com/Exocore-Organization/exocore-web/main/window.bat
window.bat

# Termux (Android)
curl -fsSL https://raw.githubusercontent.com/Exocore-Organization/exocore-web/main/termux.sh | bash
```

### Manual Build
```bash
# Build PTY helper (optional but recommended)
cd tools/pty-helper && cargo build --release && cd ../..

# Compile Exocore Web
deno task compile

# Run
./exocore-web
```

The panel will be available at **http://localhost:8080/exocore**. Set up your master account on first visit.

### Docker
```bash
docker build -t exocore-web .
docker run -p 8080:8080 -v $(pwd)/data:/data exocore-web
```

### Build for Other Platforms
```bash
deno task compile-linux     # x86_64 Linux
deno task compile-mac       # x86_64 macOS
deno task compile-mac-arm   # ARM macOS (Apple Silicon)
deno task compile-win       # x86_64 Windows
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP server port |
| `HOST` | `0.0.0.0` | Bind address |
| `devs.json` | auto-created | Master account credentials |

### Dev Gate
On first run, visit `/exocore/dev-gate` to create the master developer account. This is stored in `devs.json` at the workspace root.

## Project Structure

```
exocore-web/
├── deno.json              # Deno config + import map + compile tasks
├── build.ts               # Full build script (Rust + Deno)
├── Dockerfile             # Docker image
├── linux.sh               # Linux installer
├── termux.sh              # Termux (Android) installer
├── window.bat             # Windows CMD installer
├── install.ps1            # Windows PowerShell installer
├── tools/
│   └── pty-helper/        # Native PTY helper (Rust)
│       ├── Cargo.toml
│       └── src/main.rs
├── docs/                  # Detailed documentation
└── (source in backup/exocore-ide/)
```

## Docs

See the [docs/](docs/) directory for detailed documentation:

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Installation Guide](docs/INSTALL.md)
- [Building from Source](docs/BUILD.md)
- [Feature Overview](docs/FEATURES.md)

## License

MIT — Exocore Organization
