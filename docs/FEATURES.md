# Feature Overview

## 1. Code Editor

### Dual Engine
Exocore Web ships two editors:
- **Monaco Editor** — VS Code's editor (primary, loaded from CDN or local build)
- **ACE Editor** — lightweight fallback, toggleable

### File Operations
- Recursive file tree browser with symlink handling
- Read, write, create, delete, rename, move, copy (file/folder)
- Drag-and-drop file upload
- ZIP archive extract (upload or from project)
- File download (single file or entire project as ZIP)
- Project-wide code search (regex, case-sensitive, hidden file toggle)

### Code Intelligence
- **LSP Diagnostics** — TypeScript diagnostics via WebSocket or HTTP
- **Code folding**, formatting helpers
- **Command palette** (Ctrl+Shift+P)
- **Context menus** (right-click)
- **Code history** — per-file snapshot diffs in IndexedDB

### 60+ Editor Themes
Including light and dark variants, accessible via the settings modal.

## 2. Terminal

### Full PTY
- xterm.js with xterm-addon-fit and xterm-addon-unicode11
- 256-color support (`TERM=xterm-256color`, `COLORTERM=truecolor`)
- Runtime resize handling
- Custom prompt (`user@exocore`)

### Backend
- `node-pty` native addon (primary)
- Rust PTY helper binary (fallback, NDJSON over stdio)
- Line-shell fallback (when neither is available)

## 3. Project Runtime

### Process Management
- Start/stop/restart/kill project processes
- Port collision detection and auto-recovery
- Console I/O streaming via WebSocket
- Auto-restart guard (3 rapid restarts = 30s pause)

### Cloudflare Tunnel
- Automatic public URL via `cloudflared tunnel --url`
- Tunnel URL broadcast to console

### Console History
- Persistent `.exocore-logs` per project
- ANSI-stripped log access for AI agent

## 4. Package Managers

### NPM (Node.js)
- Search npm registry
- List installed packages with import-usage detection
- Install/uninstall packages (`--save-dev` support)
- Install all dependencies
- Check npm authentication
- Publish packages to npm

### PyLib (Python)
- Search PyPI with ranked results (exact/prefix/substring)
- List installed packages from `requirements.txt`
- Install to project `pylibs/` directory
- Uninstall (removes from `pylibs/` and `requirements.txt`)

### Dependency Scanner
Detect dependencies for: Rust (Cargo.toml), Go (go.mod), Ruby (Gemfile), PHP (composer.json), Java (pom.xml)

## 5. Project Templates

Create projects from pre-defined templates:
- **Node.js** — Express-ready with package.json
- **TypeScript** — tsconfig + build config
- **Python** — requirements.txt + app.py
- **Static HTML** — index.html + install.sh

Template creation is streamed via SSE for real-time progress feedback.

## 6. AI Agent

### Multi-Provider Support
- Gemini API
- Anthropic (Claude)
- HuggingFace Spaces

### Features
- Chat-based interaction in a sidebar panel
- Task planning and execution
- Tool-use (file operations, code reading, console access)
- Thinking token visualization
- SSE streaming responses

## 7. Social Network

### Real-Time Chat
- Global chat room with message history (last 80 messages)
- Reply-to messages
- Rate-limited (TokenBucket algorithm)
- Avatar-enriched messages

### Direct Messages
- Peer-to-peer chat
- End-to-end encryption (ciphertext + nonce) or plaintext
- DM history (last 100 messages per peer)

### Friends System
- Send/accept/decline/remove friend requests
- Friend suggestions
- Presence tracking (online/offline)

### Posts & Feed
- Create posts with text + file attachments
- Edit and delete posts
- Comment on posts
- Emoji reactions (like, love, haha, etc.)
- Admin moderation (approve/reject)
- User profile posts

### XP & Leaderboard
- Gamified experience points
- Level-up system with achievements
- Global leaderboard ranked by XP

## 8. Multiplayer Collaboration

### Room System
- Create rooms (public/private/PIN-protected)
- Max player limits, invite-only allowlists
- Ban/unban and kick users (host only)

### Real-Time Features
- Cursor position sharing (file, line, column)
- Collaborative editing (`edit` frames)
- File-open notifications
- In-room chat (last 200 messages)
- Latency/ping tracking

## 9. Cloud Integrations

### Google Drive
- OAuth device flow authentication
- Token refresh and encrypted local cache
- Single project backup/restore
- Full backup (projects + templates + extensions)
- List and delete backups

### GitHub
- OAuth device flow authentication
- Clone repos into projects
- Create repos from projects (init + commit + push)
- Connect existing projects to remotes
- Push/pull changes
- Force push support

## 10. Extensions

### Format
Extensions are defined by `extension.json` manifest files:
```json
{
  "name": "My Extension",
  "version": "1.0.0",
  "author": "You",
  "description": "Does something cool",
  "entry": "main.js",
  "icon": "icon.svg"
}
```

### Scopes
- `official/` — curated extensions
- `testing/` — experimental extensions

### Marketplace
- Google Drive-hosted marketplace
- Configurable via JSON file or folder ID
- One-click install

## 11. VNC Remote Desktop

- Xvfb virtual framebuffer
- x11vnc server via WebSocket proxy
- Works in Replit/reverse-proxy environments

## 12. Admin & Moderation

- Role-based access (user/admin/owner)
- User ban/unban and mute
- Role assignment
- User audit log
- Payment/subscription management (receipt upload, approval)

## 13. Offline Mode

Toggle CDN vs. local vendor build:
- **Online**: loads Monaco, xterm, etc. from CDN
- **Offline**: bundles everything into `dist/vendor/`
