# Installation

## Quick Install

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

## Manual

1. Install Deno — [deno.com](https://docs.deno.com/runtime/manual/getting_started/installation)
2. Download binary from [Releases](https://github.com/Exocore-Organization/exocore-web/releases)
3. Run `./exocore-web`
4. Open **http://localhost:8080/exocore**

## First-Time Setup

1. Visit `/exocore/dev-gate` — create master developer account
2. Visit `/exocore/dashboard` — create your first project
3. Visit `/exocore/editor` — start coding

## Docker

```bash
docker build -t exocore-web .
docker run -p 8080:8080 -v /path/to/data:/data exocore-web
```
