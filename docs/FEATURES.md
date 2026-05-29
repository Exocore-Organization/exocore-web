# Feature Details

## 1. Editor

### Dual Engine
- **Monaco Editor** (desktop) — full VS Code editor experience
- **Ace Editor** (mobile) — lightweight fallback
- **Split Editor** — dual pane side-by-side editing

### File Operations
- Recursive file tree browser (symlink-safe, shallow node_modules/pylibs)
- Create, read, save, delete, rename, move, copy (file/folder)
- Drag-and-drop upload, ZIP extract (upload or from project)
- Download single file, folder as ZIP, or entire project
- Project-wide code search (regex, case-sensitive, hidden file toggle)
- File history: per-file snapshot diffs in `.history/`

### LSP (TypeScript)
Full Language Server Protocol support via WebSocket:
- Diagnostics, completions, hover info, go-to-definition
- Code actions, rename refactoring, formatting, inlay hints
- Mobile HTTP fallback endpoint for TypeScript diagnostics

### Terminal
- xterm.js with fit + unicode11 addons
- 256-color support (TERM=xterm-256color, COLORTERM=truecolor)
- Runtime resize handling
- Backend: Rust PTY helper (NDJSON over stdio) or line-shell fallback

### Console
- Project process I/O streaming via WebSocket
- Start/stop/restart/kill with port collision detection
- Auto-restart guard (3 rapid restarts = 30s pause)
- Cloudflare Tunnel public URLs via trycloudflare
- Console history persisted to `.exocore-logs`

### Package Managers

**NPM:**
- Search npm registry, view package details
- List installed with import-usage detection
- Install/uninstall (`--save-dev` support), install-all
- Publish packages, check npm auth

**PyLib (Python):**
- Search PyPI with ranked results
- List installed from requirements.txt
- Install to `pylibs/`, uninstall

**Dependency Scanner:**
Rust (Cargo.toml), Go (go.mod), Ruby (Gemfile), PHP (composer.json), Java (pom.xml)

### Themes (7)
| Theme | Type | Notes |
|-------|------|-------|
| GitHub Dark | dark | |
| GitHub Light | light | |
| Dracula | dark | |
| Neo-Brutalism | dark | |
| Cyberpunk | dark | |
| Frutiger Aero | light | paid gate |
| Geometry Dash | dark | exocore category |

## 2. Sidebar Panels

| Panel | File | Purpose |
|-------|------|---------|
| NPM | `npm-pane.js` | Browse/install/uninstall npm packages |
| PyLibs | `pylib-pane.js` | Search/install Python packages |
| GitHub | `github-pane.js` | OAuth, clone, push, pull, commit |
| Cloud | `cloud-pane.js` | Google Drive backup/restore |
| Extensions | `extensions.js` | Load/manage extensions |

## 3. Bottom Panels

| Panel | Purpose |
|-------|---------|
| Console | Project process output |
| Terminal | PTY shell |
| Webview | Live preview iframe |
| Problems | LSP diagnostics |
| VNC | Virtual browser (Xvfb + noVNC) |

## 4. Social

- **Global chat**: real-time, reply-to, TokenBucket rate limit, avatar-enriched
- **Direct messages**: E2EE (ciphertext+nonce) or plaintext
- **Friends**: requests, suggestions, presence tracking
- **Posts/feed**: create with attachments, edit, delete, comment, emoji react, admin approve
- **XP system**: level-ups, achievements, global leaderboard
- **User profiles**: avatars, covers, bio, XP level

## 5. Multiplayer

Real-time collaboration system:
- Create rooms (public/private/PIN-protected, invite-only)
- Cursor sharing (file, line, column)
- Collaborative editing frames
- File-open notifications
- In-room chat (200 msg history)
- Ban/kick, max player limits, ping tracking
- Rooms register with backend registry

## 6. Cloud & Integrations

### Google Drive
- OAuth device flow authentication
- Token refresh + encrypted local cache
- Backup/restore single project or full (projects + templates + extensions)

### GitHub
- OAuth device flow authentication
- Clone repos, create repos from projects, connect to remotes
- Push/pull/commit, force push support

## 7. Extensions

- Manifest format (`extension.json`): name, version, entry, icon
- Scopes: `official/` and `testing/`
- Extension API: toast, storage, editor access, commands, status bar, keybindings
- Marketplace via Google Drive (JSON file or folder)

## 8. VNC Remote Desktop

- Xvfb virtual framebuffer (1280x800)
- x11vnc server via WebSocket proxy at `/exocore/api/vnc/ws`
- noVNC client in editor panel

## 9. Project Management

- **Templates**: Node.js, TypeScript, Python, Static HTML — SSE-streamed creation
- **Runtime**: start/stop/restart/kill, config read/write (`system.exo`), auto-start
- **Onboarding**: first-run wizard (theme, extensions, templates)

## 10. Admin

- Roles: user, admin, owner
- Ban/unban users, mute, role assignment
- Audit log, user enumeration
- Payment/subscription management (receipt upload, approve/deny)

## 11. Static Pages

| Route | Page |
|-------|------|
| `/exocore` | Home |
| `/exocore/dev-gate` | Master account setup |
| `/exocore/login` | User login |
| `/exocore/register` | Registration |
| `/exocore/forgot` | Password reset |
| `/exocore/verify-pending` | Email verification |
| `/exocore/auth/callback` | OAuth callback |
| `/exocore/dashboard` | Workspace dashboard |
| `/exocore/editor` | Code editor |
| `/exocore/leaderboard` | XP leaderboard |
| `/exocore/cloud` | Google Drive cloud |
| `/exocore/feed` | Community feed |
| `/exocore/server` | Multiplayer server browser |
| `/exocore/u/:username` | User profile |
| `/exocore/offline` | Offline fallback |
| `/` | Landing page |
