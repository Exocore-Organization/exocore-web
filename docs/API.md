# API Reference

All routes are mounted under `/exocore/api/`.

## Authentication

### Dev Gate (Master Account)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/dev-gate/status` | Check if dev gate is configured |
| POST | `/dev-gate/setup` | Create master account |
| POST | `/dev-gate/login` | Authenticate as master |
| POST | `/dev-gate/logout` | Clear session |

### User Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | User login (username/email + password) |
| POST | `/auth/register` | Register (multipart: user, pass, email, avatar, etc.) |
| POST | `/auth/forgot/request` | Request password reset OTP |
| POST | `/auth/forgot/reset` | Reset password (email + OTP + new pass) |
| GET | `/auth/verify` | Email verification |
| GET | `/auth/userinfo` | Get profile |
| POST | `/auth/userinfo` | Update profile (multipart) |
| GET | `/auth/token-verify` | Validate session token |
| POST | `/auth/delete` | Delete account |
| GET | `/auth/audit` | Owner audit log |

## Editor

### File System (`/editor/coding/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `files` | Recursive file tree |
| GET | `read` | Read file content |
| POST | `save` | Save file (auto-snapshots to `.history/`) |
| POST | `create` | Create file/directory (multipart) |
| POST | `delete` | Delete file/directory |
| POST | `rename` | Rename/move file |
| POST | `move` | Move file |
| POST | `copy` | Recursive copy |
| GET | `download` | Download project as ZIP |
| GET | `download-file` | Download single file |
| GET | `download-folder` | Download folder as ZIP |
| POST | `extract` | Upload + extract ZIP |
| POST | `upload` | Drag-drop multi-file upload |
| POST | `extract-existing` | Extract archive in project |
| GET | `media` | Serve media files |
| GET | `history` | List file edit history |
| POST | `history/push` | Push snapshot to history |
| POST | `history/clear` | Clear file history |
| POST | `search` | Project-wide code search |

### Projects (`/editor/projects/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `list` | List all projects |
| POST | `create` | Create project |
| POST | `archive` | Archive project |
| POST | `unarchive` | Restore from archive |
| POST | `delete` | Delete project |
| POST | `rename` | Rename project |

### Runtime (`/editor/runtime/`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `start` | Start project |
| POST | `stop` | Stop project |
| POST | `kill` | Force kill |
| POST | `restart` | Restart project |
| GET | `status/:projectId` | Get runtime status |
| GET | `list` | List running projects |
| GET | `logs/:projectId` | Get console logs |
| GET | `config/:projectId` | Read system.exo |
| POST | `config/:projectId` | Write system.exo |
| POST | `autostart/:projectId` | Toggle autoStart |

### Templates (`/editor/templates/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `list` | List available templates |
| GET | `icon` | Serve template icon |
| POST | `create-from-template` | SSE-streamed project creation |
| POST | `upload` | Upload new template (admin) |
| DELETE | `delete` | Delete template (admin) |

### NPM (`/editor/npm/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `list` | List installed packages |
| GET | `search` | Search npm registry |
| GET | `info/:packageName` | Package details |
| POST | `install` | Install package |
| POST | `install-all` | Install all deps |
| POST | `uninstall` | Uninstall package |
| GET | `files` | List project files |
| GET | `whoami` | Check npm auth |
| POST | `publish` | Publish to npm |
| POST | `logout` | Local npm logout |

### PyLib (`/editor/pylib/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `search` | Search PyPI |
| GET | `list` | List installed packages |
| POST | `install` | Install pip package |
| POST | `uninstall` | Uninstall package |

### GitHub (`/editor/github/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `status` | Git status |
| GET | `files` | Changed files |
| POST | `repos` | List user repos |
| POST | `clone` | Clone repo |
| POST | `create` | Create repo from project |
| POST | `connect` | Connect to remote |
| POST | `push` | Push changes |
| POST | `pull` | Pull from remote |
| POST | `auth/device` | Start OAuth device flow |
| POST | `auth/poll` | Poll OAuth token |

### Google Drive (`/editor/gdrive/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `device-code` | Start OAuth device flow |
| POST | `poll-token` | Poll OAuth token |
| POST | `refresh-token` | Refresh token |
| POST | `backup` | Backup project |
| POST | `full-backup` | Full backup |
| GET | `list-backups` | List backups |
| POST | `restore` | Restore project |
| POST | `restore-full` | Restore full backup |
| DELETE | `delete-backup` | Delete backup |

### Dependencies (`/editor/deps/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `list` | Scan multi-language deps |

### LSP Mobile (`/editor/lsp-mobile/`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `diagnostics` | TypeScript diagnostics (HTTP) |

## Social

| Method | Path | Description |
|--------|------|-------------|
| GET | `/social/avatar` | Serve avatar image |
| GET | `/social/friends` | List friends |
| POST | `/social/friend` | Send/accept/decline friend request |
| GET | `/social/peer` | Lookup user profile |
| GET | `/social/pubkey` | Manage E2EE public keys |

## Posts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/posts` | List feed |
| GET | `/posts/profile` | User's posts |
| POST | `/posts/create` | Create post |
| POST | `/posts/edit` | Edit post |
| POST | `/posts/delete` | Delete post |
| POST | `/posts/comment` | Add comment |
| POST | `/posts/react` | Toggle reaction |
| POST | `/posts/approve` | Approve/reject (admin) |

## XP & Leaderboard

| Method | Path | Description |
|--------|------|-------------|
| GET | `/xp/me` | My XP/level/achievements |
| POST | `/xp/grant` | Award XP |
| GET | `/xp/catalog` | List achievements |
| GET | `/leaderboard` | Ranked leaderboard |

## Multiplayer

| Method | Path | Description |
|--------|------|-------------|
| POST | `/multiplayer/create` | Create room |
| GET | `/multiplayer/rooms` | List local rooms |
| GET | `/multiplayer/servers` | List public servers |
| GET | `/multiplayer/by-host/:username` | Find rooms by host |
| GET | `/multiplayer/room/:roomId` | Room info |
| POST | `/multiplayer/close/:roomId` | Close room |

## Extensions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/extensions/list` | List extensions |
| GET | `/extensions/files/:scope/:name/*` | Serve extension files |
| POST | `/extensions/upload` | Upload extension |
| DELETE | `/extensions/delete` | Delete extension |
| POST | `/extensions/import-from-drive` | Import from Drive |
| GET | `/extensions/drive-files` | List Drive files |
| POST | `/extensions/export-to-drive` | Export to Drive |
| GET | `/extensions/marketplace-config` | Marketplace config |
| POST | `/extensions/marketplace-config` | Set config |
| GET | `/extensions/marketplace` | List marketplace |
| POST | `/extensions/marketplace-install` | Install from marketplace |

## Admin

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/ban` | Ban/unban user |
| POST | `/admin/mute` | Mute user |
| POST | `/admin/role` | Assign role |
| POST | `/admin/dedupe` | Deduplicate users |
| GET | `/admin/users` | List all users |

## VNC

| Method | Path | Description |
|--------|------|-------------|
| POST | `/vnc/start` | Start VNC server |
| POST | `/vnc/stop` | Stop VNC server |
| GET | `/vnc/status` | VNC status |

## System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/version` | App version |
| GET | `/users` | User enumeration |
| POST | `/settings` | Save settings |
| POST | `/recent-project` | Track recent project |
| GET | `/vendor` | Get vendor mode |
| POST | `/vendor` | Toggle vendor mode |

## WebSocket Endpoints

| Path | Description |
|------|-------------|
| `/exocore/ws` | Multiplexed carrier (social, rpc, presence, terminal, lsp) |
| `/exocore/ws/social` | Social hub (legacy) |
| `/exocore/ws/rpc` | RPC hub (legacy) |
| `/exocore/api/editor/exocore-ai/ws` | AI agent stream |
| `/exocore/api/vnc/ws` | VNC proxy |
| `/exocore/` | Status sync |
