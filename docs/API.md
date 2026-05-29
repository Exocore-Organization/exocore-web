# API Reference

All API routes under `/exocore/api/`. Full path prefix: `/exocore/api`.

## Dev Gate

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dev-gate/status` | Check if configured |
| POST | `/dev-gate/setup` | Create master account |
| POST | `/dev-gate/login` | Authenticate |
| POST | `/dev-gate/logout` | Clear session |

## Editor — File System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/editor/coding/files` | File tree listing |
| GET | `/editor/coding/read` | Read file |
| POST | `/editor/coding/save` | Save file |
| POST | `/editor/coding/create` | Create file/dir |
| POST | `/editor/coding/delete` | Delete file/dir |
| POST | `/editor/coding/rename` | Rename/move |
| POST | `/editor/coding/move` | Move file |
| POST | `/editor/coding/copy` | Recursive copy |
| GET | `/editor/coding/download` | Download project ZIP |
| GET | `/editor/coding/download-file` | Download single file |
| GET | `/editor/coding/download-folder` | Download folder ZIP |
| POST | `/editor/coding/extract` | Upload + extract ZIP |
| POST | `/editor/coding/upload` | Drag-drop upload |
| POST | `/editor/coding/extract-existing` | Extract archive in project |
| GET | `/editor/coding/media` | Serve media |
| GET | `/editor/coding/history` | File history list |
| POST | `/editor/coding/history/push` | Push snapshot |
| POST | `/editor/coding/history/clear` | Clear history |
| POST | `/editor/coding/search` | Project-wide search |

## Editor — Projects

| Method | Path | Description |
|--------|------|-------------|
| GET | `/editor/projects/list` | List projects |
| POST | `/editor/projects/create` | Create project |
| POST | `/editor/projects/archive` | Archive project |
| POST | `/editor/projects/unarchive` | Restore from archive |
| POST | `/editor/projects/delete` | Delete project |
| POST | `/editor/projects/rename` | Rename project |

## Editor — Runtime

| Method | Path | Description |
|--------|------|-------------|
| POST | `/editor/runtime/start` | Start project |
| POST | `/editor/runtime/stop` | Stop project |
| POST | `/editor/runtime/kill` | Force kill |
| POST | `/editor/runtime/restart` | Restart |
| GET | `/editor/runtime/status/:projectId` | Status |
| GET | `/editor/runtime/list` | Running projects |
| GET | `/editor/runtime/logs/:projectId` | Console logs |
| GET | `/editor/runtime/config/:projectId` | Read config |
| POST | `/editor/runtime/config/:projectId` | Write config |
| POST | `/editor/runtime/autostart/:projectId` | Toggle auto-start |

## Editor — Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/editor/templates/list` | List templates |
| GET | `/editor/templates/icon` | Template icon |
| POST | `/editor/templates/create-from-template` | SSE-streamed create |
| POST | `/editor/templates/upload` | Upload template |
| DELETE | `/editor/templates/delete` | Delete template |

## Editor — NPM

| Method | Path | Description |
|--------|------|-------------|
| GET | `/editor/npm/list` | Installed packages |
| GET | `/editor/npm/search` | Search registry |
| GET | `/editor/npm/info/:packageName` | Package details |
| POST | `/editor/npm/install` | Install package |
| POST | `/editor/npm/install-all` | Install all deps |
| POST | `/editor/npm/uninstall` | Uninstall |
| GET | `/editor/npm/files` | Project files |
| GET | `/editor/npm/whoami` | npm auth status |
| POST | `/editor/npm/publish` | Publish to npm |
| POST | `/editor/npm/logout` | npm logout |

## Editor — PyLib

| Method | Path | Description |
|--------|------|-------------|
| GET | `/editor/pylib/search` | Search PyPI |
| GET | `/editor/pylib/list` | Installed packages |
| POST | `/editor/pylib/install` | Install |
| POST | `/editor/pylib/uninstall` | Uninstall |

## Editor — GitHub

| Method | Path | Description |
|--------|------|-------------|
| GET | `/editor/github/status` | Git status |
| GET | `/editor/github/files` | Changed files |
| POST | `/editor/github/repos` | List user repos |
| POST | `/editor/github/clone` | Clone repo |
| POST | `/editor/github/create` | Create repo from project |
| POST | `/editor/github/connect` | Connect to remote |
| POST | `/editor/github/push` | Push changes |
| POST | `/editor/github/pull` | Pull |
| POST | `/editor/github/auth/device` | Start OAuth |
| POST | `/editor/github/auth/poll` | Poll OAuth token |

## Editor — Google Drive

| Method | Path | Description |
|--------|------|-------------|
| GET | `/editor/gdrive/device-code` | Start OAuth |
| POST | `/editor/gdrive/poll-token` | Poll token |
| POST | `/editor/gdrive/refresh-token` | Refresh token |
| POST | `/editor/gdrive/backup` | Backup project |
| POST | `/editor/gdrive/full-backup` | Full backup |
| GET | `/editor/gdrive/list-backups` | List backups |
| POST | `/editor/gdrive/restore` | Restore project |
| POST | `/editor/gdrive/restore-full` | Restore full |
| DELETE | `/editor/gdrive/delete-backup` | Delete backup |

## Editor — Dependencies

| Method | Path | Description |
|--------|------|-------------|
| GET | `/editor/deps/list` | Multi-lang dep scan |

## Editor — LSP Mobile

| Method | Path | Description |
|--------|------|-------------|
| POST | `/editor/lsp-mobile/diagnostics` | TS diagnostics (HTTP) |

## Multiplayer

| Method | Path | Description |
|--------|------|-------------|
| POST | `/multiplayer/create` | Create room |
| GET | `/multiplayer/rooms` | Local rooms |
| GET | `/multiplayer/servers` | Public servers |
| GET | `/multiplayer/by-host/:username` | Find by host |
| GET | `/multiplayer/room/:roomId` | Room info |
| POST | `/multiplayer/close/:roomId` | Close room |

## Extensions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/extensions/list` | List extensions |
| POST | `/extensions/import-from-drive` | Import from Drive |
| GET | `/extensions/drive-files` | Drive files |
| POST | `/extensions/export-to-drive` | Export to Drive |
| POST | `/extensions/upload` | Upload extension |
| DELETE | `/extensions/delete` | Delete |
| GET | `/extensions/marketplace-config` | Get config |
| POST | `/extensions/marketplace-config` | Set config |
| GET | `/extensions/marketplace` | Marketplace list |
| POST | `/extensions/marketplace-install` | Install |
| GET | `/extensions/files/:scope/:name/*` | Serve files |

## System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/version` | Version info |
| GET | `/leaderboard` | XP leaderboard |
| GET | `/users` | User listing |
| GET | `/vendor` | Get vendor mode |
| POST | `/vendor` | Toggle vendor mode |
| POST | `/settings` | Save settings |
| POST | `/recent-project` | Track recent project |

## VNC

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/vnc/start` | Start VNC |
| POST | `/api/vnc/stop` | Stop VNC |
| GET | `/api/vnc/status` | VNC status |

## Onboarding

| Method | Path | Description |
|--------|------|-------------|
| GET | `/onboard/status` | Check status |
| GET | `/onboard/catalog` | Templates + extensions |
| POST | `/onboard/complete` | Save preferences |
| GET | `/onboard/drive-test` | Test Drive token |

## Plans

| Method | Path | Description |
|--------|------|-------------|
| GET | `/plans/catalog` | Plan listing |
| GET | `/plans/me` | My payments |
| GET | `/plans/pending` | Pending queue (owner) |
| POST | `/plans/submit` | Submit receipt |
| POST | `/plans/decide` | Approve/deny (owner) |
| POST | `/plans/grant` | Grant plan |

## WebSocket Endpoints

| Path | Description |
|------|-------------|
| `/exocore/ws` | Multiplexed (social, rpc, presence, terminal, lsp) |
| `/exocore/api/vnc/ws` | VNC proxy |
| `/exocore/` | Status sync |
