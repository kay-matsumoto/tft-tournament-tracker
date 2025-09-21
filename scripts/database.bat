@echo off
if "%1"=="migrate" (
    wrangler d1 migrations apply %2 --env development --file database/migrations/0001_initial.sql
) else if "%1"=="console" (
    wrangler d1 console %2 --env development
) else (
    echo Usage: %0 {migrate^|console} DATABASE_NAME
    echo Example: %0 migrate tft-tournament-tracker-db
)
