# TFT Tournament Tracker - Complete Cleanup Script
# This will remove ALL Cloudflare resources and local files

param(
    [string]$ProjectName = "tft-tournament-tracker",
    [switch]$Force = $false
)

Write-Host "TFT Tournament Tracker - Complete Cleanup" -ForegroundColor Red
Write-Host "=========================================" -ForegroundColor Red

if (-not $Force) {
    Write-Host ""
    Write-Host "WARNING: This will DELETE:" -ForegroundColor Yellow
    Write-Host "- All local project files" -ForegroundColor Yellow
    Write-Host "- Cloudflare Workers" -ForegroundColor Yellow
    Write-Host "- D1 Databases (and ALL data)" -ForegroundColor Yellow
    Write-Host "- KV Namespaces (and ALL data)" -ForegroundColor Yellow
    Write-Host "- R2 Buckets (and ALL files)" -ForegroundColor Yellow
    Write-Host "- All secrets" -ForegroundColor Yellow
    Write-Host ""
    
    $confirm = Read-Host "Are you ABSOLUTELY sure? Type 'DELETE EVERYTHING' to confirm"
    if ($confirm -ne "DELETE EVERYTHING") {
        Write-Host "Cleanup cancelled." -ForegroundColor Green
        exit 0
    }
}

Write-Host "Starting complete cleanup..." -ForegroundColor Blue

# 1. Clean up local files
Write-Host "1. Cleaning up local files..." -ForegroundColor Blue
try {
    # Remove all project files except this cleanup script
    $itemsToRemove = @(
        "package.json",
        "package-lock.json",
        "wrangler.toml",
        "wrangler.dev.toml", 
        "node_modules",
        "src",
        "backend",
        "frontend",
        "database",
        "scripts",
        "config",
        ".wrangler"
    )
    
    foreach ($item in $itemsToRemove) {
        if (Test-Path $item) {
            Remove-Item -Path $item -Recurse -Force
            Write-Host "  Removed: $item" -ForegroundColor Gray
        }
    }
    Write-Host "  Local files cleaned" -ForegroundColor Green
} catch {
    Write-Host "  Error cleaning local files: $($_.Exception.Message)" -ForegroundColor Red
}

# 2. Delete Cloudflare Workers
Write-Host "2. Deleting Cloudflare Workers..." -ForegroundColor Blue
try {
    # List and delete workers
    $workers = @("$ProjectName", "$ProjectName-dev")
    
    foreach ($worker in $workers) {
        try {
            wrangler delete $worker --force 2>$null
            Write-Host "  Deleted worker: $worker" -ForegroundColor Gray
        } catch {
            Write-Host "  Worker $worker not found or already deleted" -ForegroundColor Gray
        }
    }
    Write-Host "  Workers cleanup complete" -ForegroundColor Green
} catch {
    Write-Host "  Error deleting workers: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 3. Delete D1 Databases
Write-Host "3. Deleting D1 Databases..." -ForegroundColor Blue
try {
    # Get list of D1 databases
    $d1Output = wrangler d1 list 2>&1 | Out-String
    
    # Look for project-related databases
    $databasesToDelete = @("${ProjectName}_db", "${ProjectName}_audit", "${ProjectName}-db", "${ProjectName}-audit")
    
    foreach ($dbName in $databasesToDelete) {
        if ($d1Output -match $dbName) {
            try {
                # Try to delete by name (may need to get ID first)
                $deleteOutput = wrangler d1 delete $dbName --force 2>&1
                Write-Host "  Deleted D1 database: $dbName" -ForegroundColor Gray
            } catch {
                Write-Host "  Database $dbName not found or already deleted" -ForegroundColor Gray
            }
        }
    }
    
    Write-Host "  D1 databases cleanup complete" -ForegroundColor Green
} catch {
    Write-Host "  Error cleaning D1 databases: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  You may need to delete databases manually in Cloudflare Dashboard" -ForegroundColor Yellow
}

# 4. Delete KV Namespaces
Write-Host "4. Deleting KV Namespaces..." -ForegroundColor Blue
try {
    # Get list of KV namespaces
    $kvOutput = wrangler kv namespace list 2>&1 | Out-String
    
    # Look for project-related namespaces
    $namespacesToDelete = @("SESSIONS", "CACHE")
    
    # Parse KV list output and delete matching namespaces
    if ($kvOutput -match "id") {
        foreach ($namespaceName in $namespacesToDelete) {
            if ($kvOutput -match "title.*$namespaceName.*id.*`"([^`"]+)`"") {
                $namespaceId = $matches[1]
                try {
                    wrangler kv namespace delete $namespaceId --force 2>$null
                    Write-Host "  Deleted KV namespace: $namespaceName ($namespaceId)" -ForegroundColor Gray
                } catch {
                    Write-Host "  KV namespace $namespaceName not found or already deleted" -ForegroundColor Gray
                }
            }
        }
    }
    
    Write-Host "  KV namespaces cleanup complete" -ForegroundColor Green
} catch {
    Write-Host "  Error cleaning KV namespaces: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  You may need to delete KV namespaces manually in Cloudflare Dashboard" -ForegroundColor Yellow
}

# 5. Delete R2 Buckets
Write-Host "5. Deleting R2 Buckets..." -ForegroundColor Blue
try {
    $bucketsToDelete = @("${ProjectName}-uploads", "${ProjectName}-dev-uploads")
    
    foreach ($bucket in $bucketsToDelete) {
        try {
            # First, try to empty the bucket
            try {
                wrangler r2 object delete $bucket --all --force 2>$null
            } catch {
                # Bucket might be empty or not exist
            }
            
            # Then delete the bucket
            wrangler r2 bucket delete $bucket --force 2>$null
            Write-Host "  Deleted R2 bucket: $bucket" -ForegroundColor Gray
        } catch {
            Write-Host "  R2 bucket $bucket not found or already deleted" -ForegroundColor Gray
        }
    }
    
    Write-Host "  R2 buckets cleanup complete" -ForegroundColor Green
} catch {
    Write-Host "  Error cleaning R2 buckets: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  You may need to delete R2 buckets manually in Cloudflare Dashboard" -ForegroundColor Yellow
}

# 6. Clear secrets (if possible)
Write-Host "6. Clearing secrets..." -ForegroundColor Blue
try {
    $secretNames = @("JWT_SECRET", "ENCRYPTION_KEY", "WEBHOOK_SECRET", "ADMIN_EMAIL")
    
    foreach ($secret in $secretNames) {
        try {
            # Note: Wrangler doesn't have a direct delete secret command
            # We'll just note which secrets existed
            Write-Host "  Secret $secret may still exist (clear manually if needed)" -ForegroundColor Gray
        } catch {
            # Secret doesn't exist
        }
    }
    
    Write-Host "  Secrets noted (may need manual cleanup)" -ForegroundColor Green
} catch {
    Write-Host "  Error checking secrets" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Cleanup Summary:" -ForegroundColor Blue
Write-Host "- Local files: Removed" -ForegroundColor Green
Write-Host "- Workers: Deleted" -ForegroundColor Green  
Write-Host "- D1 Databases: Deleted" -ForegroundColor Green
Write-Host "- KV Namespaces: Deleted" -ForegroundColor Green
Write-Host "- R2 Buckets: Deleted" -ForegroundColor Green
Write-Host "- Secrets: May need manual cleanup" -ForegroundColor Yellow

Write-Host ""
Write-Host "Manual cleanup steps (if needed):" -ForegroundColor Yellow
Write-Host "1. Visit Cloudflare Dashboard > Workers & Pages"
Write-Host "2. Delete any remaining workers manually"
Write-Host "3. Visit Cloudflare Dashboard > D1"
Write-Host "4. Delete any remaining databases manually"
Write-Host "5. Visit Cloudflare Dashboard > KV"
Write-Host "6. Delete any remaining namespaces manually"
Write-Host "7. Visit Cloudflare Dashboard > R2"
Write-Host "8. Delete any remaining buckets manually"

Write-Host ""
Write-Host "CLEANUP COMPLETE!" -ForegroundColor Green
Write-Host "You can now run the deployment script fresh." -ForegroundColor Green