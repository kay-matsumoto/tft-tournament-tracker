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
