# TFT Tournament Tracker - Windows PowerShell Setup Script (Fixed)
# File: scripts\setup\create_structure.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "Setting up TFT Tournament Tracker project structure..." -ForegroundColor Green

# Function to create directory and log it
function Create-Directory {
    param([string]$Path)
    
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
        Write-Host "Created directory: $Path" -ForegroundColor Green
    } else {
        Write-Host "Directory exists: $Path" -ForegroundColor Yellow
    }
}

# Function to create file with content
function Create-File {
    param([string]$FilePath, [string]$Content)
    
    if (-not (Test-Path $FilePath)) {
        $Content | Out-File -FilePath $FilePath -Encoding UTF8
        Write-Host "Created file: $FilePath" -ForegroundColor Green
    } else {
        Write-Host "File exists: $FilePath" -ForegroundColor Yellow
    }
}

Write-Host "Creating directory structure..." -ForegroundColor Blue

# Root directories
Create-Directory "src"
Create-Directory "docs"
Create-Directory "scripts"
Create-Directory "config"
Create-Directory "tests"
Create-Directory "static_assets"

# Source code directories
Create-Directory "src\admin"
Create-Directory "src\admin\components"
Create-Directory "src\admin\styles"
Create-Directory "src\admin\scripts"

Create-Directory "src\api"
Create-Directory "src\api\auth"
Create-Directory "src\api\tournaments"
Create-Directory "src\api\players"
Create-Directory "src\api\riot_integration"

Create-Directory "src\workers"

Create-Directory "src\utils"
Create-Directory "src\utils\encryption"
Create-Directory "src\utils\validation"
Create-Directory "src\utils\api_clients"

Create-Directory "src\types"
Create-Directory "src\types\riot"
Create-Directory "src\types\tournament"
Create-Directory "src\types\player"

# Static assets
Create-Directory "static_assets\css"
Create-Directory "static_assets\images"
Create-Directory "static_assets\fonts"
Create-Directory "static_assets\icons"
Create-Directory "static_assets\favicons"

# Configuration directories
Create-Directory "config\development"
Create-Directory "config\production"
Create-Directory "config\staging"

# Documentation directories
Create-Directory "docs\api"
Create-Directory "docs\setup"
Create-Directory "docs\deployment"
Create-Directory "docs\security"
Create-Directory "docs\tutorials"

# Test directories
Create-Directory "tests\unit"
Create-Directory "tests\integration"
Create-Directory "tests\e2e"
Create-Directory "tests\fixtures"

# Script directories
Create-Directory "scripts\build"
Create-Directory "scripts\deploy"
Create-Directory "scripts\database"
Create-Directory "scripts\utils"

Write-Host "Creating essential files..." -ForegroundColor Blue

# Create .gitignore content
$gitignoreContent = @'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Build outputs
dist/
build/
coverage/

# IDE files
.vscode/
.idea/
*.swp
*.swo
*~

# OS files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Windows files
desktop.ini
*.lnk

# Cloudflare
.wrangler/
wrangler.toml.bak

# Test files
*.test.js.snap

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory
coverage/
.nyc_output/

# Dependency directories
node_modules/
jspm_packages/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Optional REPL history
.node_repl_history

# Output of npm pack
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env

# Backup files
*.bak
*.backup
*.old
*.orig

# Temporary files
tmp/
temp/
.tmp/

# KV data backups
kv_backups/

# Secrets and keys
secrets.json
keys.json
api_keys.json
'@

Create-File ".gitignore" $gitignoreContent

# Create .env.example content
$envExampleContent = @'
# TFT Tournament Tracker - Environment Variables Example
# Copy this file to .env and fill in your values
# DO NOT commit .env to Git!

# Development settings
NODE_ENV=development
DEBUG_MODE=true

# Cloudflare settings
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_ZONE_ID=your_zone_id_here

# KV Namespace IDs (get these from wrangler kv:namespace create)
API_KEYS_KV_ID=your_api_keys_kv_id
TOURNAMENT_DATA_KV_ID=your_tournament_data_kv_id

# Preview KV Namespace IDs
API_KEYS_PREVIEW_KV_ID=your_preview_api_keys_kv_id
TOURNAMENT_DATA_PREVIEW_KV_ID=your_preview_tournament_data_kv_id

# Domain configuration
DOMAIN_NAME=your-domain.com
SUBDOMAIN_NAME=tft-tournament

# CORS settings
CORS_ORIGIN=*

# Webhook URLs (optional)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Error tracking (optional)
SENTRY_DSN=https://...@sentry.io/...

# Note: Sensitive values should be set using wrangler secrets:
# wrangler secret put ADMIN_TOKEN
# wrangler secret put RIOT_API_KEY
# wrangler secret put CLOUDFLARE_API_TOKEN
'@

Create-File ".env.example" $envExampleContent

# Create README.md content
$readmeContent = @'
# TFT Tournament Tracker

Secure Tournament Management Platform for Teamfight Tactics

## Features

- Secure API Key Management - AES-256-GCM encryption
- Riot Games Integration - Automatic TFT match tracking
- Tournament Management - Complete tournament lifecycle
- Player Registration - Automated verification
- Real-time Leaderboards - Live standings
- Edge Computing - Cloudflare Workers deployment

## Quick Start (Windows)

```powershell
# Clone the repository
git clone https://github.com/kay-matsumoto/tft-tournament-tracker.git
cd tft-tournament-tracker

# Set up project structure
PowerShell -ExecutionPolicy Bypass -File scripts\setup\create_structure.ps1

# Install dependencies
npm install

# Set up Cloudflare
npm run setup

# Deploy
npm run deploy
```

## Project Structure

```
tft_tournament_tracker/
├── src\
│   ├── workers\           # Cloudflare Worker functions
│   ├── admin\            # Admin panel interface
│   ├── api\              # API endpoint handlers
│   ├── utils\            # Utility functions
│   └── types\            # TypeScript definitions
├── static_assets\        # CSS, images, fonts
├── config\              # Configuration files
├── docs\                # Documentation
├── tests\               # Test files
└── scripts\             # Build and deployment scripts
```

## Windows Setup

1. Run PowerShell as Administrator
2. Set execution policy:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
3. Run setup script:
   ```powershell
   .\scripts\setup\create_structure.ps1
   ```

## Documentation

- Windows Setup Guide: docs\setup\windows_deployment.md
- API Reference: docs\api\endpoints.md
- Security Details: docs\security\encryption_details.md

Repository: https://github.com/kay-matsumoto/tft-tournament-tracker
'@

Create-File "README.md" $readmeContent

# Create batch deployment script content
$deployBatchContent = @'
@echo off
REM TFT Tournament Tracker - Windows Batch Deployment Script
REM File: scripts\deploy\set_secrets.bat

echo Setting up Cloudflare Worker secrets...
echo.

echo Setting ADMIN_TOKEN (enter a strong 32+ character random string):
wrangler secret put ADMIN_TOKEN

echo.
echo Optional: Set up additional integrations
echo.

set /p discord="Do you want to set up Discord webhook? (y/n): "
if /i "%discord%"=="y" (
    echo Setting DISCORD_WEBHOOK_URL:
    wrangler secret put DISCORD_WEBHOOK_URL
)

set /p sentry="Do you want to set up Sentry error tracking? (y/n): "
if /i "%sentry%"=="y" (
    echo Setting SENTRY_DSN:
    wrangler secret put SENTRY_DSN
)

echo.
echo Secrets setup complete!
echo Add your API keys through the admin panel at: https://your-worker-url.workers.dev/admin
echo.
pause
'@

Create-File "scripts\deploy\set_secrets.bat" $deployBatchContent

# Create PowerShell deployment script content
$deployPowerShellContent = @'
# TFT Tournament Tracker - PowerShell Deployment Script
# File: scripts\deploy\set_secrets.ps1

Write-Host "Setting up Cloudflare Worker secrets..." -ForegroundColor Green
Write-Host ""

Write-Host "Setting ADMIN_TOKEN (enter a strong 32+ character random string):" -ForegroundColor Yellow
& wrangler secret put ADMIN_TOKEN

Write-Host ""
Write-Host "Optional: Set up additional integrations" -ForegroundColor Blue
Write-Host ""

$discord = Read-Host "Do you want to set up Discord webhook? (y/n)"
if ($discord -eq "y" -or $discord -eq "Y") {
    Write-Host "Setting DISCORD_WEBHOOK_URL:" -ForegroundColor Yellow
    & wrangler secret put DISCORD_WEBHOOK_URL
}

$sentry = Read-Host "Do you want to set up Sentry error tracking? (y/n)"
if ($sentry -eq "y" -or $sentry -eq "Y") {
    Write-Host "Setting SENTRY_DSN:" -ForegroundColor Yellow
    & wrangler secret put SENTRY_DSN
}

Write-Host ""
Write-Host "Secrets setup complete!" -ForegroundColor Green
Write-Host "Add your API keys through the admin panel at: https://your-worker-url.workers.dev/admin" -ForegroundColor Cyan
'@

Create-File "scripts\deploy\set_secrets.ps1" $deployPowerShellContent

Write-Host "Project structure created successfully!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Blue
Write-Host "1. Copy config files to their proper locations"
Write-Host "2. Run: npm install"
Write-Host "3. Run: npm run setup"
Write-Host "4. Run: npm run deploy"
Write-Host ""
Write-Host "All directories use underscore/kebab-case naming (no spaces!)" -ForegroundColor Yellow
Write-Host "Ready for development!" -ForegroundColor Green