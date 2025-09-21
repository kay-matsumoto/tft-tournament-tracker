# TFT Tournament Tracker - Wrangler 4.38.0 Compatible Deployment Script
param(
    [string]$ProjectName = "tft-tournament-tracker",
    [string]$Environment = "development"
)

Write-Host "TFT Tournament Tracker - Wrangler 4.38.0 Compatible" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green

# Check wrangler version and update if needed
try {
    $wranglerVersion = wrangler --version 2>$null
    Write-Host "Current Wrangler version: $wranglerVersion" -ForegroundColor Blue
    
    if ($wranglerVersion -match "(\d+)\.(\d+)\.(\d+)") {
        $major = [int]$matches[1]
        $minor = [int]$matches[2]
        $patch = [int]$matches[3]
        
        if ($major -lt 4 -or ($major -eq 4 -and $minor -lt 38)) {
            Write-Host "Updating wrangler to latest version..." -ForegroundColor Yellow
            npm install -g wrangler@latest
        }
    }
} catch {
    Write-Host "Installing wrangler..." -ForegroundColor Yellow
    npm install -g wrangler@latest
}

# Check if user is logged in
try {
    wrangler whoami | Out-Null
    Write-Host "Wrangler authenticated" -ForegroundColor Green
} catch {
    Write-Host "Please login to Cloudflare first:" -ForegroundColor Yellow
    Write-Host "wrangler login"
    exit 1
}

# Get project configuration
if (-not $ProjectName) {
    $ProjectName = Read-Host "Enter your project name (default: tft-tournament-tracker)"
    if ([string]::IsNullOrEmpty($ProjectName)) { $ProjectName = "tft-tournament-tracker" }
}

if (-not $Environment) {
    $Environment = Read-Host "Enter environment (development/production, default: development)"
    if ([string]::IsNullOrEmpty($Environment)) { $Environment = "development" }
}

Write-Host "Project Configuration:" -ForegroundColor Blue
Write-Host "  Project Name: $ProjectName"
Write-Host "  Environment: $Environment"
Write-Host ""

# Create project structure
Write-Host "Creating project structure..." -ForegroundColor Blue
$directories = @(
    "src",
    "backend\controllers",
    "backend\middleware", 
    "backend\utils",
    "backend\routes",
    "database\migrations",
    "scripts"
)

foreach ($dir in $directories) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

# Create package.json
Write-Host "Creating package.json..." -ForegroundColor Blue
$packageJson = @{
    name = $ProjectName
    version = "1.0.0"
    description = "TFT Tournament Tracker - Professional tournament management system"
    main = "src/index.js"
    scripts = @{
        dev = "wrangler dev"
        deploy = "wrangler deploy"
        "deploy:dev" = "wrangler deploy --env development"
        "db:migrate:dev" = "wrangler d1 migrations apply $ProjectName-db --env development"
        "db:migrate:prod" = "wrangler d1 migrations apply $ProjectName-db --env production"
        "kv:list" = "wrangler kv namespace list"
        "d1:list" = "wrangler d1 list"
    }
    keywords = @("tft", "tournament", "esports", "cloudflare", "workers")
    author = "Your Name"
    license = "MIT"
}

$packageJson | ConvertTo-Json -Depth 10 | Out-File -FilePath "package.json" -Encoding UTF8

# Create wrangler.toml with latest format
Write-Host "Creating wrangler.toml (v4.38.0 format)..." -ForegroundColor Blue

$wranglerConfig = @"
#:schema node_modules/wrangler/config-schema.json
name = "$ProjectName"
main = "src/index.js"
compatibility_date = "2024-09-21"
compatibility_flags = ["nodejs_compat"]

# Development environment
[env.development]
name = "$ProjectName-dev"
vars = { ENVIRONMENT = "development", API_VERSION = "v1" }

# Production environment  
[env.production]
name = "$ProjectName"
vars = { ENVIRONMENT = "production", API_VERSION = "v1" }

# D1 Database bindings will be added by setup script
# KV namespace bindings will be added by setup script
# R2 bucket bindings will be added by setup script
"@

$wranglerConfig | Out-File -FilePath "wrangler.toml" -Encoding UTF8

# Create basic route handler
Write-Host "Creating route handler..." -ForegroundColor Blue
$routeContent = @"
// TFT Tournament Tracker - Route Handler
export const handleRequest = async (request, env, ctx) => {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    // API Routes
    if (url.pathname === '/api/health') {
        return new Response(JSON.stringify({ 
            status: 'healthy', 
            timestamp: new Date().toISOString(),
            environment: env.ENVIRONMENT || 'unknown',
            version: '1.0.0'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    if (url.pathname === '/api/info') {
        return new Response(JSON.stringify({
            name: 'TFT Tournament Tracker',
            version: '1.0.0',
            environment: env.ENVIRONMENT,
            endpoints: {
                health: '/api/health',
                info: '/api/info'
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    if (url.pathname === '/' || url.pathname === '/api') {
        return new Response(JSON.stringify({
            message: 'TFT Tournament Tracker API',
            version: '1.0.0',
            environment: env.ENVIRONMENT,
            endpoints: ['/api/health', '/api/info']
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // 404 for other routes
    return new Response(JSON.stringify({ 
        error: 'Route not found',
        path: url.pathname 
    }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
};
"@

$routeContent | Out-File -FilePath "backend\routes\index.js" -Encoding UTF8

# Create main worker file (new location for v4.38.0)
Write-Host "Creating main worker file..." -ForegroundColor Blue
$workerContent = @"
// TFT Tournament Tracker - Main Worker Entry Point (Wrangler 4.38.0)
import { handleRequest } from '../backend/routes/index.js';

export default {
    async fetch(request, env, ctx) {
        try {
            return await handleRequest(request, env, ctx);
        } catch (error) {
            console.error('Worker error:', error);
            return new Response(JSON.stringify({ 
                error: 'Internal server error',
                timestamp: new Date().toISOString()
            }), {
                status: 500,
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
    }
};
"@

$workerContent | Out-File -FilePath "src\index.js" -Encoding UTF8

# Create database migration
Write-Host "Creating database migration..." -ForegroundColor Blue
$migrationContent = @"
-- TFT Tournament Tracker - Initial Schema
-- Compatible with D1 and Wrangler 4.38.0

PRAGMA foreign_keys = ON;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'moderator', 'viewer')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT TRUE
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin user (password: admin123 - CHANGE IN PRODUCTION!)
INSERT OR REPLACE INTO users (id, email, username, password_hash, role) VALUES 
    (1, 'admin@example.com', 'admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');

-- Insert default settings
INSERT OR REPLACE INTO settings (key, value, description) VALUES 
    ('site_title', 'TFT Tournament Tracker', 'Website title'),
    ('api_version', 'v1.0.0', 'Current API version'),
    ('max_tournaments_per_day', '5', 'Maximum concurrent tournaments');
"@

$migrationContent | Out-File -FilePath "database\migrations\0001_initial.sql" -Encoding UTF8

# Functions for infrastructure setup (Wrangler 4.38.0 compatible)
function Create-D1Databases {
    Write-Host "Creating D1 databases..." -ForegroundColor Blue
    
    try {
        # Create main database using v4.38.0 syntax
        Write-Host "Creating main database..."
        $dbCommand = "wrangler d1 create `"${ProjectName}-db`""
        $dbOutput = Invoke-Expression $dbCommand 2>&1 | Out-String
        Write-Host "Database output: $dbOutput"
        
        # Extract database ID from new format
        if ($dbOutput -match "database_id\s*=\s*`"([^`"]+)`"") {
            $dbId = $matches[1]
            Write-Host "Main database ID: $dbId" -ForegroundColor Green
        } else {
            Write-Host "Could not parse database ID. Check output above." -ForegroundColor Yellow
            $dbId = "REPLACE_WITH_DB_ID"
        }

        # Add D1 binding to wrangler.toml
        $configContent = Get-Content "wrangler.toml" -Raw
        $dbBinding = @"

# D1 Database bindings
[[env.development.d1_databases]]
binding = "DB"
database_name = "${ProjectName}-db"
database_id = "$dbId"

[[env.production.d1_databases]]
binding = "DB"
database_name = "${ProjectName}-db"
database_id = "$dbId"
"@
        
        ($configContent + $dbBinding) | Out-File -FilePath "wrangler.toml" -Encoding UTF8
        Write-Host "Database binding added to wrangler.toml" -ForegroundColor Green
        
    } catch {
        Write-Host "Error creating D1 database: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Please create database manually in Cloudflare Dashboard" -ForegroundColor Yellow
    }
}

function Create-KVNamespaces {
    Write-Host "Creating KV namespaces..." -ForegroundColor Blue
    
    try {
        # Create KV namespaces using v4.38.0 syntax
        Write-Host "Creating SESSIONS KV namespace..."
        $sessionsCommand = "wrangler kv namespace create `"SESSIONS`""
        $sessionsOutput = Invoke-Expression $sessionsCommand 2>&1 | Out-String
        
        if ($sessionsOutput -match "id\s*=\s*`"([^`"]+)`"") {
            $sessionsId = $matches[1]
            Write-Host "Sessions KV ID: $sessionsId" -ForegroundColor Green
        } else {
            Write-Host "Could not parse Sessions KV ID" -ForegroundColor Yellow
            $sessionsId = "REPLACE_WITH_SESSIONS_ID"
        }

        Write-Host "Creating CACHE KV namespace..."
        $cacheCommand = "wrangler kv namespace create `"CACHE`""
        $cacheOutput = Invoke-Expression $cacheCommand 2>&1 | Out-String
        
        if ($cacheOutput -match "id\s*=\s*`"([^`"]+)`"") {
            $cacheId = $matches[1]
            Write-Host "Cache KV ID: $cacheId" -ForegroundColor Green
        } else {
            Write-Host "Could not parse Cache KV ID" -ForegroundColor Yellow
            $cacheId = "REPLACE_WITH_CACHE_ID"
        }

        # Add KV bindings to wrangler.toml
        $configContent = Get-Content "wrangler.toml" -Raw
        $kvBindings = @"

# KV namespace bindings
[[env.development.kv_namespaces]]
binding = "SESSIONS"
id = "$sessionsId"

[[env.development.kv_namespaces]]
binding = "CACHE"
id = "$cacheId"

[[env.production.kv_namespaces]]
binding = "SESSIONS"
id = "$sessionsId"

[[env.production.kv_namespaces]]
binding = "CACHE"
id = "$cacheId"
"@
        
        ($configContent + $kvBindings) | Out-File -FilePath "wrangler.toml" -Encoding UTF8
        Write-Host "KV bindings added to wrangler.toml" -ForegroundColor Green
        
    } catch {
        Write-Host "Error creating KV namespaces: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Please create KV namespaces manually in Cloudflare Dashboard" -ForegroundColor Yellow
    }
}

function Set-Secrets {
    Write-Host "Setting up secrets..." -ForegroundColor Blue
    
    try {
        # Generate random secrets
        $jwtSecret = [System.Web.Security.Membership]::GeneratePassword(32, 0)
        $encryptionKey = [System.Web.Security.Membership]::GeneratePassword(32, 0)
        $webhookSecret = [System.Web.Security.Membership]::GeneratePassword(16, 0)

        # Set secrets using wrangler 4.38.0 format
        Write-Host "Setting JWT_SECRET..."
        echo $jwtSecret | wrangler secret put JWT_SECRET --env $Environment
        
        Write-Host "Setting ENCRYPTION_KEY..."
        echo $encryptionKey | wrangler secret put ENCRYPTION_KEY --env $Environment
        
        Write-Host "Setting WEBHOOK_SECRET..."
        echo $webhookSecret | wrangler secret put WEBHOOK_SECRET --env $Environment
        
        $adminEmail = Read-Host "Enter admin email"
        echo $adminEmail | wrangler secret put ADMIN_EMAIL --env $Environment
        
        Write-Host "Secrets configured successfully" -ForegroundColor Green
        
    } catch {
        Write-Host "Error setting secrets: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Fallback: Using basic secrets..." -ForegroundColor Yellow
        
        # Fallback method
        echo "super-secret-jwt-key-change-in-production" | wrangler secret put JWT_SECRET --env $Environment
        echo "super-secret-encryption-key-change-in-production" | wrangler secret put ENCRYPTION_KEY --env $Environment
        echo "webhook-secret" | wrangler secret put WEBHOOK_SECRET --env $Environment
    }
}

# Main deployment flow
Write-Host "Deployment Options:" -ForegroundColor Yellow
Write-Host "1. Full setup (infrastructure + deploy)"
Write-Host "2. Infrastructure only"
Write-Host "3. Deploy code only"
Write-Host "4. Create files only (no deployment)"

$deployOption = Read-Host "Choose option (1-4)"

switch ($deployOption) {
    "1" {
        Write-Host "Running full setup..." -ForegroundColor Blue
        Create-D1Databases
        Create-KVNamespaces
        Set-Secrets
        
        Write-Host "Deploying worker..." -ForegroundColor Blue
        wrangler deploy --env $Environment
        
        Write-Host "Running database migration..." -ForegroundColor Blue
        wrangler d1 migrations apply "${ProjectName}-db" --env $Environment --file database/migrations/0001_initial.sql
    }
    "2" {
        Write-Host "Setting up infrastructure only..." -ForegroundColor Blue
        Create-D1Databases
        Create-KVNamespaces
        Set-Secrets
    }
    "3" {
        Write-Host "Deploying code only..." -ForegroundColor Blue
        wrangler deploy --env $Environment
    }
    "4" {
        Write-Host "Files created. Manual setup required." -ForegroundColor Blue
    }
    default {
        Write-Host "Invalid option" -ForegroundColor Red
        exit 1
    }
}

# Create helper scripts
Write-Host "Creating helper scripts..." -ForegroundColor Blue

# Development script
$devScript = @"
@echo off
echo Starting TFT Tournament Tracker (Development)...
wrangler dev --env development
"@
$devScript | Out-File -FilePath "scripts\dev.bat" -Encoding ASCII

# Deploy script
$deployScript = @"
@echo off
echo Deploying TFT Tournament Tracker...
wrangler deploy --env production
"@
$deployScript | Out-File -FilePath "scripts\deploy.bat" -Encoding ASCII

# Database script
$dbScript = @"
@echo off
if "%1"=="migrate" (
    wrangler d1 migrations apply %2 --env development --file database/migrations/0001_initial.sql
) else if "%1"=="console" (
    wrangler d1 console %2 --env development
) else (
    echo Usage: %0 {migrate^|console} DATABASE_NAME
    echo Example: %0 migrate tft-tournament-tracker-db
)
"@
$dbScript | Out-File -FilePath "scripts\database.bat" -Encoding ASCII

Write-Host ""
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Test your deployment:" -ForegroundColor Blue
Write-Host "  npm run dev"
Write-Host "  Visit: http://localhost:8787"
Write-Host "  API Health: http://localhost:8787/api/health"
Write-Host ""
Write-Host "Deploy to production:" -ForegroundColor Blue
Write-Host "  npm run deploy"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Test the basic API endpoints"
Write-Host "2. Check wrangler.toml for any placeholder IDs"
Write-Host "3. Add your tournament tracking features"
Write-Host "4. Set up your frontend"
Write-Host ""
Write-Host "TFT Tournament Tracker is ready!" -ForegroundColor Green