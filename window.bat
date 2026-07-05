@echo off
setlocal EnableDelayedExpansion
title Exocore Web

set "EXOCORE_DIR=%USERPROFILE%\.exocore"
set "EXOCORE_PORT=5000"
set "REPO_URL=https://github.com/Exocore-Organization/exocore-web"
set "SUBCMD=%~1"
if "%SUBCMD%"=="" set "SUBCMD=all"

:: Colors
for /f %%a in ('echo prompt $E^| cmd') do set "ESC=%%a"
set "C_RST=%ESC%[0m"
set "C_GRN=%ESC%[32m"
set "C_YEL=%ESC%[33m"
set "C_CYN=%ESC%[36m"
set "C_RED=%ESC%[31m"
set "C_BLD=%ESC%[1m"

:log     echo %C_CYN%[exocore]%C_RST% %~1 & exit /b 0
:ok      echo %C_GRN%[  ok  ]%C_RST% %~1 & exit /b 0
:warn    echo %C_YEL%[ warn ]%C_RST% %~1 & exit /b 0
:err     echo %C_RED%[error ]%C_RST% %~1 >&2 & exit /b 0

:banner
echo.
echo %C_CYN%%C_BLD%  ███████╗██╗  ██╗ ██████╗  ██████╗ ██████╗ ███████╗%C_RST%
echo %C_CYN%%C_BLD%  ██╔════╝╚██╗██╔╝██╔═══██╗██╔════╝██╔═══██╗██╔════╝%C_RST%
echo %C_CYN%%C_BLD%  █████╗   ╚███╔╝ ██║   ██║██║      ██║   ██║██████╔╝%C_RST%
echo %C_CYN%%C_BLD%  ██╔══╝   ██╔██╗ ██║   ██║██║      ██║   ██║██╔══██╗%C_RST%
echo %C_CYN%%C_BLD%  ███████╗██╔╝ ██╗╚██████╔╝╚██████╗╚██████╔╝██║  ██║%C_RST%
echo %C_CYN%%C_BLD%  ╚══════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝%C_RST%
echo %C_BLD%  Browser-based IDE  ^•  Windows Installer (Binary)%C_RST%
echo.
goto :dispatch

:check_deno
where deno >nul 2>&1
if errorlevel 1 (
    call :warn "Deno not found. Installing..."
    powershell -NoProfile -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://deno.land/install.ps1'))" || (
        call :err "Failed to install Deno."
        pause & exit /b 1
    )
)
for /f "delims=" %%v in ('deno --version') do set "DENO_VER=%%v"
call :ok "Deno !DENO_VER!"
exit /b 0

:check_python
where python3 >nul 2>&1 || where python >nul 2>&1 || (
    call :warn "Python not found — install manually from python.org if needed."
    exit /b 0
)
exit /b 0

:ensure_git
where git >nul 2>&1
if errorlevel 1 (
    call :warn "Git not found. Installing via winget..."
    winget install --id Git.Git --silent --accept-source-agreements --accept-package-agreements >nul 2>&1
    if errorlevel 1 (
        call :err "Failed to install Git. Install manually from git-scm.com"
        pause & exit /b 1
    )
)
exit /b 0

:ensure_lfs
call :ensure_git
git lfs version >nul 2>&1
if errorlevel 1 (
    call :warn "Git LFS not found. Installing..."
    winget install --id Git.Git --silent --accept-source-agreements --accept-package-agreements >nul 2>&1
    git lfs install
)
exit /b 0

:clone_repo
call :ensure_lfs
if not exist "%EXOCORE_DIR%" (
    call :log "Cloning Exocore repository framework..."
    set "GIT_LFS_SKIP_SMUDGE=1"
    git clone --progress "%REPO_URL%" "%EXOCORE_DIR%"
    
    call :log "Downloading standalone binaries (300MB+) with progress..."
    cd /d "%EXOCORE_DIR%"
    git lfs pull
    call :ok "Repository and files downloaded successfully!"
) else (
    call :log "Exocore directory already exists. Checking for missing files..."
    cd /d "%EXOCORE_DIR%"
    git lfs pull
)
exit /b 0

:install_node_pty
call :clone_repo
if not exist "%EXOCORE_DIR%\node_modules\node-pty" (
    call :warn "Installing node-pty for full terminal support..."
    cd /d "%EXOCORE_DIR%"
    npm init -y >nul 2>&1
    npm install node-pty@1.1.0 2>&1 | findstr /V "^$"
    if errorlevel 1 ( call :warn "node-pty install failed (no native build tools). Terminal will use basic mode." )
)
exit /b 0

:start_server
cd /d "%EXOCORE_DIR%" 2>nul || (call :err "Directory %EXOCORE_DIR% not found." & pause & exit /b 1)
if not exist "exocore-ide.exe" (
    call :err "Binary not found: %EXOCORE_DIR%\exocore-ide.exe"
    call :log "Install it via: window.bat install"
    pause & exit /b 1
)
call :install_node_pty
set "PORT=%EXOCORE_PORT%"
set "NODE_ENV=production"
call :log "Starting Exocore on port %EXOCORE_PORT%..."
echo.
echo   %C_GRN%Open: http://localhost:%EXOCORE_PORT%/exocore%C_RST%
echo.
exocore-ide.exe
exit /b 0

:doctor
echo.
call :log "EXOCORE_DIR : %EXOCORE_DIR%"
where deno >nul 2>&1 && (for /f "delims=" %%v in ('deno --version') do call :log "deno        : %%v") || call :warn "deno not found"
where git >nul 2>&1 && (for /f "delims=" %%v in ('git --version') do call :log "git         : %%v") || call :warn "git not found"
if exist "%EXOCORE_DIR%\exocore-ide.exe" (call :ok "Binary found") else call :warn "Binary NOT found at %EXOCORE_DIR%\exocore-ide.exe"
echo.
exit /b 0

:dispatch
if /i "%SUBCMD%"=="doctor" ( call :doctor & goto :eof )
if /i "%SUBCMD%"=="start" ( call :check_deno && call :start_server & goto :eof )
if /i "%SUBCMD%"=="install" (
    call :banner
    call :check_deno
    call :check_python
    call :install_node_pty
    call :doctor
    goto :eof
)
if /i "%SUBCMD%"=="all" (
    call :banner
    call :check_deno
    call :check_python
    call :install_node_pty
    call :doctor
    call :start_server
    goto :eof
)
call :err "Usage: window.bat [all^|install^|start^|doctor]"
pause
