[CmdletBinding()]
param(
    [ValidateSet('all', 'start', 'doctor')]
    [string]$Command = 'all',
    [string]$TargetDir = "$env:USERPROFILE\.exocore"
)

$ESC = [char]27
$C = @{ R="$ESC[0m"; G="$ESC[32m"; Y="$ESC[33m"; C="$ESC[36m"; Rd="$ESC[31m"; B="$ESC[1m" }
$RepoUrl = "https://github.com/Exocore-Organization/exocore-web"

function Log($m) { Write-Host "${C.C}[exocore]${C.R} $m" }
function Ok($m)  { Write-Host "${C.G}[  ok  ]${C.R} $m" }
function Warn($m){ Write-Host "${C.Y}[ warn ]${C.R} $m" }

function Write-Banner {
    Write-Host @"
$($C.C)$($C.B)  ███████╗██╗  ██╗██████╗  ██████╗  ██████╗ ██████╗ ███████╗$($C.R)
$($C.C)$($C.B)  ██╔════╝╚██╗██╔╝██╔═══██╗██╔════╝ ██╔═══██╗██╔══██╗██╔════╝$($C.R)
$($C.C)$($C.B)  █████╗   ╚███╔╝ ██║   ██║██║      ██║   ██║██████╔╝█████╗  $($C.R)
$($C.C)$($C.B)  ██╔══╝   ██╔██╗ ██║   ██║██║      ██║   ██║██╔══██╗██╔══╝  $($C.R)
$($C.C)$($C.B)  ███████╗██╔╝ ██╗╚██████╔╝╚██████╗╚██████╔╝██║  ██║███████╗$($C.R)
$($C.C)$($C.B)  ╚══════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝$($C.R)
$($C.B)  Browser-based IDE  •  Windows Installer$($C.R)
"@
}

function Ensure-Cmd($name, $id) {
    if (Get-Command $name -ErrorAction SilentlyContinue) { Ok "$name installed"; return $true }
    Warn "$name not found, installing via winget..."
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Warn "winget not available. Install $name manually."
        return $false
    }
    if ($name -eq "deno") {
        powershell -NoProfile -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://deno.land/install.ps1'))" | Out-Null
    } else {
        $p = Start-Process winget -Wait -PassThru -NoNewWindow -ArgumentList "install","--id",$id,"--silent","--accept-source-agreements","--accept-package-agreements"
        if ($p.ExitCode -notin 0,1641,3010) { Warn "Failed to install $name"; return $false }
    }
    $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
    Ok "$name installed"; return $true
}

function Check-Deno  { if (-not (Ensure-Cmd "deno" "Deno.Deno")) { return $false }; $v = deno --version | Select-Object -First 1; Ok "Deno $v"; $true }
function Check-Python {
    if (Get-Command python3 -ErrorAction SilentlyContinue) { Ok "Python $(python3 --version 2>&1)"; return $true }
    if (Get-Command python -ErrorAction SilentlyContinue) { Ok "Python $(python --version 2>&1)"; return $true }
    Warn "Python not found — install manually from python.org"
    return $true
}

function Ensure-Git {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Warn "Git not found. Installing..."
        Ensure-Cmd "git" "Git.Git"
    }
}

function Ensure-Lfs {
    Ensure-Git
    $lfsVer = git lfs version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Warn "Git LFS not found. Installing..."
        Ensure-Cmd "git-lfs" "Git.Git"
        git lfs install
    }
}

function Clone-Repo {
    Ensure-Lfs
    if (-not (Test-Path $TargetDir)) {
        Log "Cloning Exocore repository framework..."
        $env:GIT_LFS_SKIP_SMUDGE = "1"
        git clone --progress $RepoUrl $TargetDir 2>&1 | ForEach-Object { Write-Host $_ }
        
        Log "Downloading standalone binaries (300MB+) with progress..."
        Push-Location $TargetDir
        git lfs pull 2>&1 | ForEach-Object { Write-Host $_ }
        Pop-Location
        Ok "Repository and files downloaded successfully!"
    } else {
        Log "Exocore directory already exists. Checking for missing files..."
        Push-Location $TargetDir
        git lfs pull 2>&1 | ForEach-Object { Write-Host $_ }
        Pop-Location
    }
}

function Install-NodePty {
    Clone-Repo
    $nm = Join-Path $TargetDir "node_modules\node-pty"
    if (-not (Test-Path $nm)) {
        Warn "Installing node-pty for full terminal support..."
        Push-Location $TargetDir
        npm init -y 2>$null | Out-Null
        $result = npm install node-pty@1.1.0 2>&1 | Select-Object -Last 3
        if ($LASTEXITCODE -eq 0) { Ok "node-pty installed" }
        else { Warn "node-pty install failed ($result). Terminal will use basic mode." }
        Pop-Location
    }
}

function Start-Server {
    $binary = Join-Path $TargetDir "exocore-ide.exe"
    if (-not (Test-Path $binary)) {
        Warn "Binary not found at $binary. Place exocore-ide.exe in $TargetDir and re-run."
        return
    }
    Install-NodePty
    Log "Starting Exocore..."
    $env:PORT = "5000"
    $env:NODE_ENV = "production"
    Set-Location $TargetDir
    & $binary
}

function Show-Doctor {
    if (Get-Command deno -ErrorAction SilentlyContinue) { $v = deno --version | Select-Object -First 1; Log "deno: $v" } else { Warn "deno not found" }
    if (Get-Command python3 -ErrorAction SilentlyContinue) { Log "python3: $(python3 --version 2>&1)" } else { Warn "python3 not found" }
    if (Get-Command git -ErrorAction SilentlyContinue) { Log "git: $(git --version)" } else { Warn "git not found" }
    $binary = Join-Path $TargetDir "exocore-ide.exe"
    if (Test-Path $binary) { Ok "Binary found" } else { Warn "Binary not found at $binary" }
}

Write-Banner
switch ($Command) {
    'doctor' { Show-Doctor }
    'start'  { Check-Deno | Out-Null; Start-Server }
    'all'    { Check-Deno | Out-Null; Check-Python | Out-Null; Show-Doctor; Start-Server }
}
