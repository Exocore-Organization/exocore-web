# Architecture

## Overview

Exocore Web is a compiled Deno binary that serves a browser-based IDE workspace — code editor, terminal, project runtime, social features, AI agent, and multiplayer — over a single HTTP server.

```
┌──────────────────────────────────────────────────────┐
│                  exocore-web binary                    │
│  ┌──────────────────────────────────────────────┐    │
│  │           Express 5 HTTP Server               │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │    │
│  │  │ API      │ │ Static   │ │ WebSocket Mux │ │    │
│  │  │ Routes   │ │ Pages    │ │  ┌social───┐ │ │    │
│  │  │          │ │ (HTML)   │ │  ├rpc──────┤ │ │    │
│  │  │          │ │          │ │  ├presence─┤ │ │    │
│  │  │          │ │          │ │  ├terminal─┤ │ │    │
│  │  │          │ │          │ │  └lsp──────┘ │ │    │
│  │  └──────────┘ └──────────┘ └──────────────┘ │    │
│  ┌──────────────────────────────────────────────┐    │
│  │        Services Layer                         │    │
│  │  ProjectManager  TemplateService  FsWatcher  │    │
│  │  DevGate         ExoConfig       Social      │    │
│  └──────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────┐    │
│  │         Backend WebSocket Bridge              │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────┐
│  Rust PTY Helper     │
│  (pty-helper)        │
│  NDJSON over stdio   │
└──────────────────────┘
```

## Key Components

### 1. HTTP Server (Express 5)
- Mounted at `/exocore/`
- Serves static HTML/CSS/JS from `static-pages/`
- API routes under `/exocore/api/`
- VNC WebSocket proxy at `/exocore/api/vnc/ws`
- Port proxy at `/exocore/port/:port/`

### 2. WebSocket Multiplexer
Single WebSocket at `/exocore/ws` carries 5 channels:
- **social** — chat, DMs, presence, friends
- **rpc** — RPC request/response
- **presence** — multiplayer collaboration
- **terminal** — PTY/console I/O
- **lsp** — LSP diagnostics

30s keepalive pings. Binary frame format (type + name + payload).

### 3. Routing
- **`routes/index.ts`** aggregates all API route modules
- **`packages/app.ts`** defines static page routes + VNC + install script endpoints
- **`packages/index.ts`** ties everything together + WebSocket upgrades + Exocore AI routes

### 4. PTY Management
1. Rust `pty-helper` binary (NDJSON protocol)
2. Line-shell fallback (simulated shell with history)

### 5. Backend Bridge
WebSocket connection to `Exocore Backend` for: auth, social data, XP/leaderboard.

## Data Flow

```
Browser ──HTTP──▶ Express ──▶ Route Handler ──▶ Backend Bridge / FS / PTY
Browser ──WS────▶ Mux ──▶ social/rpc/presence/terminal/lsp channels
```
