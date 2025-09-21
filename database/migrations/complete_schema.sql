-- TFT Tournament Tracker - Complete Database Schema
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

-- Players table
CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    region TEXT NOT NULL CHECK (region IN ('NA', 'EU', 'APAC', 'KR', 'CN', 'BR', 'LAN', 'LAS', 'OCE', 'JP', 'RU', 'TR')),
    country TEXT,
    twitch_username TEXT,
    discord_tag TEXT,
    riot_puuid TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tournaments table
CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    league_type TEXT NOT NULL CHECK (league_type IN ('pro', 'ladder')),
    tournament_format TEXT NOT NULL CHECK (tournament_format IN ('checkmate_20', 'highest_points')),
    total_days INTEGER NOT NULL DEFAULT 3,
    current_day INTEGER DEFAULT 1,
    games_per_day INTEGER DEFAULT 6,
    max_lobbies INTEGER DEFAULT 32,
    start_date DATE NOT NULL,
    end_date DATE,
    status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed', 'cancelled')),
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tournament participants
CREATE TABLE IF NOT EXISTS tournament_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id),
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_id, player_id)
);

-- Lobbies table
CREATE TABLE IF NOT EXISTS lobbies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    lobby_number INTEGER NOT NULL,
    day_number INTEGER NOT NULL,
    game_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed')),
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_id, day_number, game_number, lobby_number)
);

-- Lobby participants
CREATE TABLE IF NOT EXISTS lobby_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lobby_id INTEGER NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id),
    placement INTEGER CHECK (placement BETWEEN 1 AND 8),
    points INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lobby_id, player_id)
);

-- Streaming links for lobbies
CREATE TABLE IF NOT EXISTS lobby_streams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lobby_id INTEGER NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    streamer_name TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'twitch' CHECK (platform IN ('twitch', 'youtube', 'other')),
    stream_url TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Game results table
CREATE TABLE IF NOT EXISTS game_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id),
    lobby_id INTEGER NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    game_number INTEGER NOT NULL,
    placement INTEGER NOT NULL CHECK (placement BETWEEN 1 AND 8),
    points INTEGER NOT NULL CHECK (points BETWEEN 1 AND 8),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_id, player_id, day_number, game_number)
);

-- Tournament statistics
CREATE TABLE IF NOT EXISTS tournament_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id),
    total_points INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    first_places INTEGER DEFAULT 0,
    second_places INTEGER DEFAULT 0,
    third_places INTEGER DEFAULT 0,
    fourth_places INTEGER DEFAULT 0,
    fifth_places INTEGER DEFAULT 0,
    sixth_places INTEGER DEFAULT 0,
    seventh_places INTEGER DEFAULT 0,
    eighth_places INTEGER DEFAULT 0,
    top_four_count INTEGER DEFAULT 0,
    top_four_plus_firsts INTEGER DEFAULT 0,
    current_rank INTEGER,
    end_of_day_placement INTEGER,
    last_game_placement INTEGER,
    second_last_game_placement INTEGER,
    third_last_game_placement INTEGER,
    fourth_last_game_placement INTEGER,
    fifth_last_game_placement INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_id, player_id)
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

-- Insert default admin user (password: admin123)
INSERT OR REPLACE INTO users (id, email, username, password_hash, role) VALUES 
    (1, 'admin@example.com', 'admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');

-- Insert default settings
INSERT OR REPLACE INTO settings (key, value, description) VALUES 
    ('site_title', 'TFT Tournament Tracker', 'Website title'),
    ('api_version', 'v1.0.0', 'Current API version'),
    ('max_tournaments_per_day', '5', 'Maximum concurrent tournaments');