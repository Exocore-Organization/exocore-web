# Architecture

## Overview

Exocore Web is a browser-based IDE that runs as a standalone compiled binary. It serves a full developer workspace including a code editor, terminal, file manager, runtime management, social features, and AI assistant — all from a single HTTP server.

```
┌─────────────────────────────────────────────────────┐
│                   exocore-web                        │
│  ┌──────────────────────────────────────────────┐   │
│  │           Express 5 HTTP Server               │   │
│  │  ┌────────┐ ┌────────┐ ┌──────────────────┐  │   │
│  │  │ Routes │ │  Pages │ │  WebSocket Mux    │  │   │
│  │  │  (API) │ │ (HTML) │ │  ┌── social ──┐  │  │   │
│  │  │        │ │        │ │  ├── rpc ─────┤  │  │   │
│  │  │        │ │        │ │  ├── presence ─┤  │  │   │
│  │  │        │ │        │ │  ├── terminal ─┤  │  │   │
│  │  │        │ │        │ │  └── lsp ──────┘  │  │   │
│  │  └────────┘ └────────┘ └──────────────────┘  │   │
│  ┌──────────────────────────────────────────────┐   │
│  │              Services Layer                   │   │
│  │  ProjectManager  TemplateService  FsWatcher  │   │
│  │  DevGate         ExoConfig       Store       │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │         Backend WebSocket Bridge              │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Rust PTY Helper    │
│  (pty-helper)       │
│  stdio NDJSON       │
└─────────────────────┘
```

## Key Components

### 1. HTTP Server (Express 5)
- Mounts all routes under `/exocore/`
- Serves static HTML/CSS/JS pages
- Reverse-proxies `/exocore/port/:port/` to user projects
- Handles file uploads (multipart), SSE streams

### 2. WebSocket Multiplexer (`server/wsMux.ts`)
- Single WebSocket at `/exocore/ws` multiplexes 5 channels:
  - **social** — chat, DMs, presence, friends
  - **rpc** — RPC request/response for all features
  - **presence** — multiplayer collaboration
  - **terminal** — PTY/console I/O streams
  - **lsp** — LSP diagnostics bridge
- Compact binary frame format (type + name-length + name + payload)
- 30s keepalive pings

### 3. File System
- All file operations go through the `projects/` directory
- Each project is a subdirectory with a `system.exo` config file
- History snapshots stored in `.history/` subdirectory

### 4. PTY Management
- Primary: `node-pty` native addon (when available)
- Fallback: Rust `pty-helper` binary (NDJSON protocol over stdio)
- Last resort: line-shell fallback (simulated shell)

### 5. Backend Bridge
- Connects to `Exocore Backend` via WebSocket for:
  - Authentication/registration
  - Social data persistence
  - XP/leaderboard storage

## Data Flow

```
Browser ──HTTP──▶ Express Router ──▶ Route Handler ──▶ Response
Browser ──WS────▶ WS Multiplexer ──▶ Channel Handler ──▶ Response
Route Handler ──▶ Backend Bridge ──▶ Exocore Backend
Route Handler ──▶ File System ──▶ projects/ directory
Shell Handler ──▶ PTY Helper ──▶ Child Shell Process
```
