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
    (1, 'admin@example.com', 'admin', '.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');

-- Insert default settings
INSERT OR REPLACE INTO settings (key, value, description) VALUES 
    ('site_title', 'TFT Tournament Tracker', 'Website title'),
    ('api_version', 'v1.0.0', 'Current API version'),
    ('max_tournaments_per_day', '5', 'Maximum concurrent tournaments');
