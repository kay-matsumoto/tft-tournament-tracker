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
