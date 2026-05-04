@echo off
setlocal EnableDelayedExpansion
:: ============================================================================
:: Exocore — Windows Installer / Launcher
:: Requires: Git for Windows, Node.js 18+
::
:: Double-click to run, or from CMD/PowerShell:
::   window.bat
::   window.bat start        <- start server only (skip install)
::   window.bat update       <- git pull + restart
::   window.bat doctor       <- print environment info
:: ============================================================================

title Exocore Web Installer

set "REPO_URL=https://github.com/your-org/exocore"
set "BRANCH=main"
set "EXOCORE_DIR=%USERPROFILE%\.exocore"
set "EXOCORE_PORT=5000"
set "SUBCMD=%~1"
if "%SUBCMD%"=="" set "SUBCMD=all"

:: ── Colors via ANSI (Windows 10 1511+) ──────────────────────────────────────
for /f %%a in ('echo prompt $E^| cmd') do set "ESC=%%a"
set "C_RST=%ESC%[0m"
set "C_GRN=%ESC%[32m"
set "C_YEL=%ESC%[33m"
set "C_CYN=%ESC%[36m"
set "C_RED=%ESC%[31m"
set "C_BLD=%ESC%[1m"

:: ── Banner ───────────────────────────────────────────────────────────────────
:banner
echo.
echo %C_CYN%%C_BLD%  ███████╗██╗  ██╗ ██████╗  ██████╗ ██████╗ ███████╗%C_RST%
echo %C_CYN%%C_BLD%  ██╔════╝╚██╗██╔╝██╔═══██╗██╔════╝██╔═══██╗██╔════╝%C_RST%
echo %C_CYN%%C_BLD%  █████╗   ╚███╔╝ ██║   ██║██║     ██║   ██║██████╔╝%C_RST%
echo %C_CYN%%C_BLD%  ██╔══╝   ██╔██╗ ██║   ██║██║     ██║   ██║██╔══██╗%C_RST%
echo %C_CYN%%C_BLD%  ███████╗██╔╝ ██╗╚██████╔╝╚██████╗╚██████╔╝██║  ██║%C_RST%
echo %C_CYN%%C_BLD%  ╚══════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝%C_RST%
echo %C_BLD%  Browser-based IDE  ^•  Windows Installer%C_RST%
echo.
goto :dispatch

:: ── Helpers ──────────────────────────────────────────────────────────────────
:log
echo %C_CYN%[exocore]%C_RST% %~1
exit /b 0
:ok
echo %C_GRN%[  ok  ]%C_RST% %~1
exit /b 0
:warn
echo %C_YEL%[ warn ]%C_RST% %~1
exit /b 0
:err
echo %C_RED%[error ]%C_RST% %~1 >&2
exit /b 0

:: ── Check prerequisites ───────────────────────────────────────────────────────
:check_node
where node >nul 2>&1
if errorlevel 1 (
    call :err "Node.js not found."
    echo.
    echo   Install from: %C_CYN%https://nodejs.org/en/download/%C_RST%
    echo   Then re-run this script.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node -e "process.stdout.write(process.version)"') do set "NODE_VER=%%v"
call :ok "Node.js !NODE_VER!"
exit /b 0

:check_git
where git >nul 2>&1
if errorlevel 1 (
    call :err "Git not found."
    echo.
    echo   Install from: %C_CYN%https://git-scm.com/download/win%C_RST%
    echo   Then re-run this script.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('git --version') do set "GIT_VER=%%v"
call :ok "!GIT_VER!"
exit /b 0

:: ── Clone or update ───────────────────────────────────────────────────────────
:fetch_repo
if exist "%EXOCORE_DIR%\.git" (
    call :log "Updating existing installation at %EXOCORE_DIR%..."
    git -C "%EXOCORE_DIR%" pull --ff-only origin %BRANCH%
) else (
    call :log "Cloning Exocore to %EXOCORE_DIR%..."
    git clone --depth=1 --branch %BRANCH% %REPO_URL% "%EXOCORE_DIR%"
    if errorlevel 1 (
        call :err "Clone failed. Check REPO_URL and your internet connection."
        pause & exit /b 1
    )
)
call :ok "Source at %EXOCORE_DIR%"
exit /b 0

:: ── Install npm dependencies ──────────────────────────────────────────────────
:install_deps
call :log "Installing npm dependencies..."
cd /d "%EXOCORE_DIR%"
set "PUPPETEER_SKIP_DOWNLOAD=1"
set "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1"
npm install --omit=dev --legacy-peer-deps --no-audit --no-fund
if errorlevel 1 (
    call :err "npm install failed."
    pause & exit /b 1
)
call :ok "Dependencies installed"
exit /b 0

:: ── Create desktop shortcut ───────────────────────────────────────────────────
:create_shortcut
call :log "Creating desktop shortcut..."
set "LAUNCHER=%EXOCORE_DIR%\start-exocore.bat"
(
    echo @echo off
    echo title Exocore Web
    echo cd /d "%EXOCORE_DIR%"
    echo set "PORT=%EXOCORE_PORT%"
    echo set "NODE_ENV=production"
    echo set "PUPPETEER_SKIP_DOWNLOAD=1"
    echo echo Starting Exocore...
    echo echo Open: http://localhost:%EXOCORE_PORT%/exocore
    echo node dist\index.js
    echo pause
) > "%LAUNCHER%"

:: PowerShell shortcut on Desktop
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Exocore.lnk'); $s.TargetPath = '%LAUNCHER%'; $s.WorkingDirectory = '%EXOCORE_DIR%'; $s.Description = 'Exocore Browser IDE'; $s.Save()" ^
  2>nul && (
    call :ok "Desktop shortcut created: Exocore.lnk"
) || (
    call :warn "Could not create desktop shortcut (PowerShell unavailable)"
    call :ok "Launcher script: %LAUNCHER%"
)
exit /b 0

:: ── Start server ──────────────────────────────────────────────────────────────
:start_server
cd /d "%EXOCORE_DIR%"
call :log "Starting Exocore..."
echo.
echo   %C_GRN%Open: http://localhost:%EXOCORE_PORT%/exocore%C_RST%
echo.
set "PORT=%EXOCORE_PORT%"
set "NODE_ENV=production"
set "PUPPETEER_SKIP_DOWNLOAD=1"
node dist\index.js
exit /b 0

:: ── Doctor ────────────────────────────────────────────────────────────────────
:doctor
echo.
call :log "EXOCORE_DIR : %EXOCORE_DIR%"
call :log "PORT        : %EXOCORE_PORT%"
where node  >nul 2>&1 && (for /f "delims=" %%v in ('node -e "process.stdout.write(process.version)"') do call :log "node        : %%v") || call :warn "node not found"
where npm   >nul 2>&1 && (for /f "delims=" %%v in ('npm -v') do call :log "npm         : %%v") || call :warn "npm not found"
where git   >nul 2>&1 && (for /f "delims=" %%v in ('git --version') do call :log "git         : %%v") || call :warn "git not found"
if exist "%EXOCORE_DIR%\dist\index.js" (call :ok "dist/index.js found") else call :warn "dist/index.js NOT found — run installer first"
echo.
exit /b 0

:: ── Finish banner ─────────────────────────────────────────────────────────────
:finish
echo.
echo %C_GRN%%C_BLD%╔══════════════════════════════════════════════╗%C_RST%
echo %C_GRN%%C_BLD%║      Exocore installed successfully!         ║%C_RST%
echo %C_GRN%%C_BLD%╚══════════════════════════════════════════════╝%C_RST%
echo.
echo   Start:   double-click %C_BLD%Exocore%C_RST% on your Desktop
echo            or run:  %C_CYN%node dist\index.js%C_RST%  from %EXOCORE_DIR%
echo.
echo   Then open: %C_CYN%http://localhost:%EXOCORE_PORT%/exocore%C_RST%
echo.
pause
exit /b 0

:: ── Dispatch ─────────────────────────────────────────────────────────────────
:dispatch
if /i "%SUBCMD%"=="doctor" (
    call :doctor
    goto :eof
)
if /i "%SUBCMD%"=="start" (
    call :check_node || goto :eof
    call :start_server
    goto :eof
)
if /i "%SUBCMD%"=="update" (
    call :check_git  || goto :eof
    call :fetch_repo || goto :eof
    call :start_server
    goto :eof
)
if /i "%SUBCMD%"=="all" (
    call :check_git  || goto :eof
    call :check_node || goto :eof
    call :fetch_repo || goto :eof
    call :install_deps || goto :eof
    call :create_shortcut
    call :finish
    call :start_server
    goto :eof
)
call :err "Unknown command: %SUBCMD%"
echo Usage: window.bat [all^|start^|update^|doctor]
pause
