<div align="center">

<img src="exocore-web/static-pages/exo-icon.png" alt="Exocore" width="96"/>

# Exocore

**Self-hosted multi-project developer panel — your global IDE, your server, your rules.**

[![Version](https://img.shields.io/badge/version-v5.0.0-yellow?style=flat-square)](https://github.com/Exocore-Organization/exocore-web)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green?style=flat-square)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20Android-lightgrey?style=flat-square)](#installation)

[Features](#features) · [Install](#installation) · [Screenshots](#screenshots) · [Extensions](#extensions) · [Templates](#templates) · [Contributing](#contributing)

</div>

---

## What is Exocore?

Exocore is a **self-hosted developer panel** that lets you create, run, and manage multiple projects from a single web UI — on your own machine, your own server, or your Android phone via Termux.

No cloud lock-in. No subscriptions. Everything runs on infrastructure you control.

> Built for developers worldwide — every language, every timezone, every device.

---

## Features

### Editor
- **Monaco Editor** — full VS Code-grade editor for desktop browsers
- **SimpleCode** — mobile-first editor (textarea + Prism.js) for Android & iOS; no Monaco dependency, full OS text selection/copy/paste support
- **117 themes** — Dracula, Tokyo Night, Catppuccin, Gruvbox, Nord, SynthWave '84, Minecraft, K-Pop, Honkai, Genshin, Liquid Glass, Bahay Kubo, and 105 more
- **Syntax highlighting** for 20+ languages via Prism.js
- **LSP** (TypeScript Language Server) — hover, go-to-definition, find all references (Shift+F12), diagnostics
- **ExoShell** — fish-style smart input bar with ghost completions, history (200 entries), sub-command expansions
- **Command palette** — fuzzy search over all editor actions
- **Auto-save** — saves 1.8 s after the last keystroke; Ctrl/Cmd+S for manual save

### AI Coding Agent
- Powered by **Google Gemini**
- Autonomous: reads files, writes code, runs shell commands, fixes errors — all in a loop
- Streams tokens live to the chat panel
- **Language-aware** — replies in whatever language you write in (English, Tagalog, Taglish, Spanish, Chinese, Arabic, and more)
- Detects greetings vs. coding tasks using natural language understanding — no hardcoded keyword lists
- Never injects debug signals or boilerplate into your code

### Project Runtime
- **Multi-project** — start, stop, restart, and tail logs for each project independently
- **Cloudflare tunnel** — one-click public URL per project via `cloudflared`
- **VNC / Virtual Browser** — Xvfb + noVNC embedded in the editor panel; run Playwright, Puppeteer, or any headless browser with a real display
- **Persistent logs** — project output flushed to `.exocore-logs` on exit; survives server restarts
- **Auto-start** — projects can be configured to start automatically on Exocore boot

### Sidebar Panels
| Panel | What it does |
|-------|--------------|
| Files | File tree with icons per extension (DJB2 color-hashing for unknown types) |
| Terminal | node-pty PTY with full ANSI support |
| npm | Install / uninstall packages, browse `package.json` scripts |
| Python Libs | pip install / list for Python projects |
| Git | Status, diff, commit, push/pull |
| Cloud | Cloudflare tunnel controls |
| TODO | Scans all files for `TODO`, `FIXME`, `HACK`, `BUG`, `NOTE`, `XXX` — jump to line on click |
| Extensions | Browse, install, and manage extensions |
| VNC | Start/stop virtual display; open noVNC viewer inline |

### Social & Gamification
- **Feed** — team activity stream
- **Leaderboard** — ranked by XP with animated tier frames
- **Profiles** — avatar, bio, stats, 8 design presets (Neon, Carbon, Sakura, Matrix, Gold, Galaxy, Fire, Default)
- **Level frames** — 10 tiers (Stone → Void/God), 1,000 levels, animated CSS conic-gradient rings
- **Role system** — Owner / Admin / Moderator / User access control

### Infrastructure
- **Offline support** — Service Worker caches 50+ critical assets; offline fallback page with per-platform download cards
- **Google Drive** — refresh-token integration for template downloads and border assets
- **Onboarding wizard** — first-run flow: pick theme, templates, extensions, borders
- **WebSocket multiplexer** — single `/exocore/ws` endpoint handles terminal, social, RPC, and LSP channels
- **Obfuscated dist build** — `node build-dist.mjs` compiles TypeScript → full obfuscation (server) + safe obfuscation (browser)

---

## Extensions

Five extensions ship with Exocore out of the box:

| Extension | Author | Description |
|-----------|--------|-------------|
| **Canvas** | Exocore Team | Drag-and-drop visual canvas → generates HTML / JSX / TSX / JS / TS code; 12 shape types, 26 Google Fonts, 18 CSS animations, device preview, PNG/WebM export |
| **FAHH** | Rohan Singh | Plays a sound whenever a terminal command exits with an error — never miss a failed build again |
| **FileTree Pro** | Exocore Community | Right-click context menus (New File, New Folder, Rename, Delete, Copy Path), live filter/search, file-info tooltips |
| **Tree Todo** | Exocore Community | Scans every file for `TODO / FIXME / HACK / NOTE / BUG / OPTIMIZE` comments; click any item to jump straight to it |
| **Minecraft** | Exocore Team | Minecraft pixel-font theme skin for the editor UI |

Community extensions can be dropped into `extension/official/` as extracted zip folders. See [`extension/README.md`](exocore-web/extension/README.md) for the manifest format and authoring guide.

---

## Templates

62 starter templates ready to clone:

<details>
<summary>Show all templates</summary>

| | | | |
|---|---|---|---|
| Angular | Astro | Bun | C |
| C++ | C# | CLI Tool | Deno |
| Discord Bot | Django | Electron | Eleventy |
| Elixir | Expo | Express API | FastAPI |
| Fastify | Flask | Flutter | Gatsby |
| Gin | Go | Godot Script | Haskell |
| HolyC | Hono | Ionic | Java |
| Koa | Kotlin | Love2D | Lua |
| Minecraft | NestJS | Next.js | Node |
| Node.js | Nuxt.js | OpenAI Chat | Phaser |
| PHP | Preact | Pygame | Python |
| Qwik | React Native | Remix | R Lang |
| Ruby | Rust | Sinatra | Static HTML |
| SvelteKit | Swift | Tauri | Telegram Bot |
| TypeScript | Vite + React | Vite + Solid | Vite + Svelte |
| Vite + Vue | WhatsApp Bot | | |

</details>

---

## Installation

### Linux (Ubuntu, Debian, Fedora, Arch, openSUSE)
```bash
curl -fsSL https://raw.githubusercontent.com/Exocore-Organization/exocore-web/main/linux.sh | bash
```

### Android (Termux)
```bash
curl -fsSL https://raw.githubusercontent.com/Exocore-Organization/exocore-web/main/termux.sh | bash
```

### Windows
```bat
curl -fsSL https://raw.githubusercontent.com/Exocore-Organization/exocore-web/main/window.bat -o exocore-install.bat && exocore-install.bat
```

### Docker
```bash
git clone https://github.com/Exocore-Organization/exocore-web.git
cd exocore-web
docker build -t exocore .
docker run -p 5000:5000 -v $(pwd)/projects:/app/projects exocore
```

### Manual
```bash
git clone https://github.com/Exocore-Organization/exocore-web.git
cd exocore-web
npm install
npm run dev        # development
# or
npm run build      # build dist/
npm start          # production (node dist/index.js)
```

Open `http://localhost:5000` in your browser.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Port to listen on (default `5000`) |
| `EXO_GDRIVE_REFRESH_TOKEN` | Google Drive OAuth refresh token for template/asset downloads |

---

## Build

```bash
node build-dist.mjs
```

Compiles TypeScript, copies all assets, and obfuscates JS into `dist/`. Deploy the `dist/` folder + `package.json` + `node_modules/` to any Linux server.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Server | Node.js + TypeScript, Express v5, `node-pty`, `ws` |
| Editor | Monaco Editor (desktop), Prism.js + textarea (mobile) |
| AI Agent | Google Gemini (`@google/genai`) |
| Frontend | Vanilla JS + CSS (no framework) |
| LSP | `typescript-language-server` |
| Auth | JWT, bcrypt, role-based access control |
| Tunnel | `cloudflared` |
| VNC | Xvfb + x11vnc + noVNC |
| Offline | Service Worker (Cache-First static, Network-Only API) |
| Build | `tsc` + `javascript-obfuscator` |

---

## Screenshots

> Coming soon — contributions welcome!

---

## Contributing

Pull requests are welcome. For major changes, open an issue first.

1. Fork the repo
2. Create a branch: `git checkout -b feat/your-feature`
3. Commit your changes
4. Open a PR against `main`

---

## Contributors

| Name | Role |
|------|------|
| Johnsteve Costaños | Core |
| Jonell Magallanes | Core |
| Jr Busaco | Core |
| Kiff Hyacinth Pon | Core |
| Cyril Encenso | Core |
| Francis Loyd M. Raval  | Core |

---

## License

[MIT](LICENSE) — free to use, modify, and self-host.

---

<div align="center">
  <sub>Exocore v5.0.0 · Built for developers, by developers · 🌐 Global IDE</sub>
</div>
