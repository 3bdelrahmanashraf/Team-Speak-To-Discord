<#
.SYNOPSIS
    TeamSpeak to Discord Bridge - Windows Installation Script

.DESCRIPTION
    This script automates the installation on Windows systems.
    Run with: powershell -ExecutionPolicy Bypass -File install.ps1
    Or download and run: irm https://raw.githubusercontent.com/3bdelrahmanashraf/Team-Speak-To-Discord/main/scripts/install.ps1 | iex

.PARAMETER InstallDir
    Installation directory (default: $env:USERPROFILE\teamspeak-discord-bridge)

.PARAMETER Branch
    Git branch to install (default: main)

.PARAMETER NoDocker
    Skip Docker database setup

.PARAMETER SkipDeps
    Skip dependency installation

.PARAMETER SkipConfig
    Skip configuration setup

.EXAMPLE
    .\install.ps1

.EXAMPLE
    .\install.ps1 -InstallDir "C:\bridge" -Branch "develop"
#>

param(
    [string]$InstallDir = "$env:USERPROFILE\teamspeak-discord-bridge",
    [string]$Branch = "main",
    [switch]$NoDocker,
    [switch]$SkipDeps,
    [switch]$SkipConfig
)

$ErrorActionPreference = "Stop"

# Colors
$Red = "`e[31m"
$Green = "`e[32m"
$Yellow = "`e[33m"
$Blue = "`e[34m"
$Cyan = "`e[36m"
$Magenta = "`e[35m"
$Bold = "`e[1m"
$Dim = "`e[2m"
$Reset = "`e[0m"

function Write-Banner {
    Write-Host "`n${Cyan}╔══════════════════════════════════════════════════════════════╗${Reset}"
    Write-Host "${Cyan}║${Reset}  ${Bold}TeamSpeak to Discord Bridge - Windows Installer${Reset}  ${Cyan}║${Reset}"
    Write-Host "${Cyan}║${Reset}  ${Dim}Version 0.1.0${Reset}                                            ${Cyan}║${Reset}"
    Write-Host "${Cyan}╚══════════════════════════════════════════════════════════════╝${Reset}`n"
}

function Write-Step {
    param([int]$Current, [int]$Total, [string]$Title)
    Write-Host "`n${Blue}[$Current/$Total]${Reset} ${Bold}$Title${Reset}"
    Write-Host "${Dim}────────────────────────────────────────${Reset}"
}

function Write-Success { param([string]$Msg) Write-Host "  ${Green}✓${Reset} $Msg" }
function Write-Error { param([string]$Msg) Write-Host "  ${Red}✗${Reset} $Msg" }
function Write-Warning { param([string]$Msg) Write-Host "  ${Yellow}⚠${Reset} $Msg" }
function Write-Info { param([string]$Msg) Write-Host "  ${Cyan}ℹ${Reset} $Msg" }

function Check-Command {
    param([string]$Command)
    try {
        $null = & $Command --version 2>$null
        return $true
    } catch {
        return $false
    }
}

function Check-Dependencies {
    Write-Step 1 5 "Checking Dependencies"

    $missing = @()
    $warnings = @()

    # Node.js
    if (Check-Command "node") {
        $version = node --version
        $major = [int]($version.TrimStart('v').Split('.')[0])
        if ($major -ge 20) {
            Write-Success "Node.js $version found"
        } else {
            $warnings += "Node.js $version found. Version 20+ recommended."
        }
    } else {
        $missing += "Node.js 20+"
    }

    # npm
    if (Check-Command "npm") {
        Write-Success "npm found"
    } else {
        $missing += "npm"
    }

    # Git
    if (Check-Command "git") {
        Write-Success "Git found"
    } else {
        $missing += "Git"
    }

    # Docker (optional)
    if (Check-Command "docker") {
        Write-Success "Docker found"
    } else {
        $warnings += "Docker not found. Container deployment unavailable."
    }

    # Docker Compose (optional)
    if (Check-Command "docker-compose") {
        Write-Success "Docker Compose found"
    } elseif (& docker compose version 2>$null) {
        Write-Success "Docker Compose (v2) found"
    } else {
        $warnings += "Docker Compose not found. Multi-container deployment unavailable."
    }

    # Windows Build Tools
    if (Check-Command "node-gyp") {
        Write-Success "Windows Build Tools (node-gyp) found"
    } else {
        $warnings += "Windows Build Tools may be needed. Run: npm install -g windows-build-tools"
    }

    # PostgreSQL client
    if (Check-Command "psql") {
        Write-Success "PostgreSQL client found"
    } else {
        $warnings += "PostgreSQL client (psql) not found."
    }

    # Redis CLI
    if (Check-Command "redis-cli") {
        Write-Success "Redis CLI found"
    } else {
        $warnings += "Redis CLI not found."
    }

    if ($missing.Count -gt 0) {
        Write-Error "Missing required dependencies:"
        $missing | ForEach-Object { Write-Host "    ${Red}✗${Reset} $_" }
        Write-Host ""
        Write-Error "Please install missing dependencies and run the script again."
        Write-Info "Node.js: https://nodejs.org/"
        Write-Info "Git: https://git-scm.com/"
        exit 1
    }

    if ($warnings.Count -gt 0) {
        Write-Warning "Warnings:"
        $warnings | ForEach-Object { Write-Host "    ${Yellow}⚠${Reset} $_" }
    }
}

function Create-Directories {
    Write-Step 2 5 "Creating Directories"
    $dirs = @("data", "logs", "config")
    foreach ($dir in $dirs) {
        $fullPath = Join-Path $InstallDir $dir
        if (-not (Test-Path $fullPath)) {
            New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
            Write-Success "Created $dir/"
        } else {
            Write-Info "$dir/ already exists"
        }
    }
}

function Clone-Repository {
    Write-Step 3 5 "Cloning Repository"
    $repoUrl = "https://github.com/3bdelrahmanashraf/Team-Speak-To-Discord.git"

    if (Test-Path (Join-Path $InstallDir ".git")) {
        Write-Info "Repository already exists, updating..."
        Set-Location $InstallDir
        git fetch origin
        git checkout $Branch
        git pull origin $Branch
    } else {
        Write-Info "Cloning from $repoUrl..."
        git clone -b $Branch $repoUrl $InstallDir
        Set-Location $InstallDir
    }
    Write-Success "Repository ready"
}

function Setup-Configuration {
    if ($SkipConfig) {
        Write-Step 4 5 "Configuration Setup"
        Write-Info "Skipped (--skip-config flag used)"
        return
    }

    Write-Step 4 5 "Configuration Setup"
    $envPath = Join-Path $InstallDir ".env"

    if (Test-Path $envPath) {
        $overwrite = Read-Host "Configuration file exists. Overwrite? (y/N)"
        if ($overwrite -notmatch '^[Yy]$') {
            Write-Info "Skipping configuration setup."
            return
        }
    }

    Write-Host "${Magenta}Discord Bot Configuration${Reset}"
    $discordToken = Read-Host -AsSecureString "Discord Bot Token" | ConvertFrom-SecureString
    $discordClientId = Read-Host "Discord Client ID"
    $discordGuildId = Read-Host "Discord Guild ID"

    Write-Host "`n${Magenta}TeamSpeak Server Configuration${Reset}"
    $tsHost = Read-Host "TeamSpeak Host/IP"
    $tsQueryPort = Read-Host "TeamSpeak Query Port" -Default "10011"
    $tsUsername = Read-Host "TeamSpeak Query Username" -Default "serveradmin"
    $tsPassword = Read-Host -AsSecureString "TeamSpeak Query Password" | ConvertFrom-SecureString
    $tsServerId = Read-Host "TeamSpeak Virtual Server ID" -Default "1"

    Write-Host "`n${Magenta}Audio Configuration${Reset}"
    Write-Host "Select audio quality:"
    Write-Host "  1. low (24kbps)"
    Write-Host "  2. medium (48kbps)"
    Write-Host "  3. high (64kbps) [default]"
    Write-Host "  4. ultra (128kbps)"
    $audioChoice = Read-Host "Choice [3]" -Default "3"
    switch ($audioChoice) {
        1 { $audioQuality = "low" }
        2 { $audioQuality = "medium" }
        3 { $audioQuality = "high" }
        4 { $audioQuality = "ultra" }
        default { $audioQuality = "high" }
    }

    Write-Host "`n${Magenta}Database Configuration${Reset}"
    $useDocker = Read-Host "Use Docker for PostgreSQL/Redis? (Y/n)" -Default "Y"
    if ($useDocker -match '^[Yy]$') {
        $databaseUrl = "postgresql://bridge:password@localhost:5432/teamspeak_discord_bridge"
        $redisUrl = "redis://localhost:6379"
        $global:UseDocker = $true
    } else {
        $dbHost = Read-Host "PostgreSQL Host" -Default "localhost"
        $dbPort = Read-Host "PostgreSQL Port" -Default "5432"
        $dbUser = Read-Host "PostgreSQL Username" -Default "bridge"
        $dbPassword = Read-Host -AsSecureString "PostgreSQL Password" | ConvertFrom-SecureString
        $dbName = Read-Host "PostgreSQL Database" -Default "teamspeak_discord_bridge"
        $databaseUrl = "postgresql://$dbUser:$dbPassword@$dbHost:$dbPort/$dbName"

        $redisHost = Read-Host "Redis Host" -Default "localhost"
        $redisPort = Read-Host "Redis Port" -Default "6379"
        $redisUrl = "redis://$redisHost:$redisPort"
        $global:UseDocker = $false
    }

    Write-Host "`n${Magenta}Web Dashboard${Reset}"
    $dashboardEnabled = Read-Host "Enable Web Dashboard? (Y/n)" -Default "Y"
    if ($dashboardEnabled -match '^[Yy]$') {
        $webDashboardEnabled = "true"
        $dashboardPort = Read-Host "Dashboard Port" -Default "3000"
    } else {
        $webDashboardEnabled = "false"
        $dashboardPort = "3000"
    }

    # Generate .env
    $envContent = @"
# TeamSpeak to Discord Bridge Configuration
# Generated by install.ps1 on $(Get-Date -Format o)

# Discord
DISCORD_TOKEN=$discordToken
DISCORD_CLIENT_ID=$discordClientId
DISCORD_GUILD_ID=$discordGuildId

# TeamSpeak
TS_HOST=$tsHost
TS_QUERY_PORT=$tsQueryPort
TS_USERNAME=$tsUsername
TS_PASSWORD=$tsPassword
TS_SERVER_ID=$tsServerId

# Audio
AUDIO_QUALITY=$audioQuality
AUDIO_VAD_ENABLED=true
AUDIO_NOISE_SUPPRESSION_ENABLED=true

# Database
DATABASE_URL=$databaseUrl

# Redis
REDIS_URL=$redisUrl

# Web Dashboard
WEB_DASHBOARD_ENABLED=$webDashboardEnabled
WEB_DASHBOARD_PORT=$dashboardPort

# Environment
NODE_ENV=development
"@

    Set-Content -Path $envPath -Value $envContent -Encoding UTF8
    Write-Success "Configuration saved to .env"
}

function Install-Dependencies {
    if ($SkipDeps) {
        Write-Step 5 5 "Installing Dependencies"
        Write-Info "Skipped (--skip-deps flag used)"
        return
    }

    Write-Step 5 5 "Installing Dependencies"
    Set-Location $InstallDir

    Write-Info "Installing npm packages..."
    try {
        npm ci
        Write-Success "Dependencies installed"
    } catch {
        Write-Error "Failed to install dependencies"
        Write-Info "Try running: npm install -g windows-build-tools"
        exit 1
    }

    Write-Info "Generating Prisma client..."
    try {
        npx prisma generate
        Write-Success "Prisma client generated"
    } catch {
        Write-Warning "Prisma client generation failed"
    }

    # Build project
    Write-Info "Building TypeScript project..."
    try {
        npm run build
        Write-Success "Project built successfully"
    } catch {
        Write-Error "Build failed"
        exit 1
    }
}

function Setup-Docker {
    if ($NoDocker -or -not $global:UseDocker) { return }

    Write-Info "Starting database services with Docker Compose..."
    Set-Location $InstallDir
    try {
        docker compose up -d postgres redis
        Write-Success "Database services started"
        Start-Sleep -Seconds 5

        Write-Info "Running database migrations..."
        npx prisma migrate deploy
        Write-Success "Database migrations applied"
    } catch {
        Write-Error "Failed to start database services or run migrations"
        Write-Info "Run manually: docker compose up -d postgres redis && npx prisma migrate deploy"
    }
}

function Create-StartupScripts {
    # Batch file
    $batContent = @"
@echo off
echo Starting TeamSpeak to Discord Bridge...
cd /d "%~dp0"
npm run start
pause
"@
    Set-Content -Path (Join-Path $InstallDir "start.bat") -Value $batContent -Encoding ASCII
    Write-Success "Created start.bat"

    # PowerShell script
    $ps1Content = @"
Write-Host "Starting TeamSpeak to Discord Bridge..."
Set-Location "$InstallDir"
npm run start
"@
    Set-Content -Path (Join-Path $InstallDir "start.ps1") -Value $ps1Content -Encoding UTF8
    Write-Success "Created start.ps1"

    # Docker startup
    $dockerBat = "@echo off`ndocker compose up -d`n"
    Set-Content -Path (Join-Path $InstallDir "docker-start.bat") -Value $dockerBat -Encoding ASCII
    Write-Success "Created docker-start.bat"
}

function Write-Completion {
    Write-Host "`n${Green}"
    Write-Host "╔══════════════════════════════════════════════════════════════╗"
    Write-Host "║  Installation Complete!                                      ║"
    Write-Host "╚══════════════════════════════════════════════════════════════╝"
    Write-Host "${Reset}"

    Write-Host "${Bold}Next Steps:${Reset}"
    Write-Host "  1. Review configuration: ${Cyan}$InstallDir\.env${Reset}"
    Write-Host "  2. Start the bridge:"
    Write-Host "     ${Cyan}cd $InstallDir && .\start.bat${Reset}        # Batch startup"
    Write-Host "     ${Cyan}cd $InstallDir && .\start.ps1${Reset}       # PowerShell startup"
    Write-Host "     ${Cyan}cd $InstallDir && npm run dev${Reset}       # Development mode"
    Write-Host "     ${Cyan}cd $InstallDir && docker compose up -d${Reset}  # Docker deployment"
    Write-Host ""
    Write-Host "  3. Access Web Dashboard: ${Cyan}http://localhost:3000${Reset}"
    Write-Host ""
    Write-Host "${Bold}Useful Commands:${Reset}"
    Write-Host "  ${Cyan}npm run dev${NC}           # Development mode"
    Write-Host "  ${Cyan}npm run build${NC}         # Production build"
    Write-Host "  ${Cyan}npm run test${NC}          # Run tests"
    Write-Host "  ${Cyan}npm run lint${NC}          # Check code style"
    Write-Host "  ${Cyan}docker compose logs -f${NC} # View Docker logs"
    Write-Host ""
    Write-Host "${Bold}Documentation:${Reset}"
    Write-Host "  ${Cyan}README.md${NC}             # Full documentation"
    Write-Host "  ${Cyan}docs/${NC}                 # Additional guides"
}

# Main
Write-Banner
Write-Info "Installing TeamSpeak to Discord Bridge to $InstallDir"
Write-Info "Repository: https://github.com/3bdelrahmanashraf/Team-Speak-To-Discord.git (branch: $Branch)"

Check-Dependencies
Create-Directories
Clone-Repository
Setup-Configuration
Install-Dependencies
Setup-Docker
Create-StartupScripts
Write-Completion