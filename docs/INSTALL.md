# Installation Guide

## Quick Install (Pre-built Binary)

### Linux
```bash
curl -fsSL https://raw.githubusercontent.com/Exocore-Organization/exocore-web/main/linux.sh | bash
```

### Termux (Android)
```bash
curl -fsSL https://raw.githubusercontent.com/Exocore-Organization/exocore-web/main/termux.sh | bash
```

### Windows (PowerShell)
```powershell
curl -o install.ps1 https://raw.githubusercontent.com/Exocore-Organization/exocore-web/main/install.ps1
powershell -ExecutionPolicy Bypass -File install.ps1
```

### Windows (CMD)
```cmd
curl -o window.bat https://raw.githubusercontent.com/Exocore-Organization/exocore-web/main/window.bat
window.bat
```

## Manual Installation

### 1. Install Deno

**Linux/macOS:**
```bash
curl -fsSL https://deno.land/install.sh | sh
```

**Windows:**
```powershell
irm https://deno.land/install.ps1 | iex
```

**Termux:**
```bash
pkg install deno
```

### 2. Download the Binary

Download the latest `exocore-web` binary from the [Releases](https://github.com/Exocore-Organization/exocore-web/releases) page:

```bash
# Linux
curl -L -o exocore-web https://github.com/Exocore-Organization/exocore-web/releases/latest/download/exocore-web
chmod +x exocore-web

# macOS
curl -L -o exocore-web https://github.com/Exocore-Organization/exocore-web/releases/latest/download/exocore-web-mac
chmod +x exocore-web

# macOS (Apple Silicon)
curl -L -o exocore-web https://github.com/Exocore-Organization/exocore-web/releases/latest/download/exocore-web-mac-arm
chmod +x exocore-web

# Windows
curl -L -o exocore-web.exe https://github.com/Exocore-Organization/exocore-web/releases/latest/download/exocore-web.exe
```

### 3. Run

```bash
./exocore-web
```

Open **http://localhost:8080/exocore** in your browser.

## First-Time Setup

1. Visit `/exocore/dev-gate` — create the master developer account
2. Visit `/exocore/dashboard` — create your first project
3. Visit `/exocore/editor` — start coding

## Configuration

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP server port |
| `HOST` | `0.0.0.0` | Bind address |

### devs.json
The master account is stored in `devs.json` at the server root. You can pre-configure it:

```json
{
  "user": "admin",
  "pass": "your-password"
}
```

If `devs.json` exists on startup, the dev gate setup step is skipped.

## Docker

```bash
docker pull ghcr.io/exocore-organization/exocore-web:latest
docker run -p 8080:8080 -v /path/to/data:/data exocore-web
```

## Troubleshooting

### Port Already in Use
The server checks for port conflicts on startup. Set `PORT` to a different value:
```bash
PORT=3000 ./exocore-web
```
Access at **http://localhost:3000/exocore**.

### Terminal Not Working
If the terminal doesn't open, the PTY helper may not be available. The app falls back to a line-shell. Install the Rust PTY helper from the release assets.
