-- Tournaments table
CREATE TABLE tournaments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    region VARCHAR(10) NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'upcoming',
    prize_pool INTEGER,
    max_participants INTEGER,
    tournament_code VARCHAR(100), -- For official tournaments
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tournament participants (players in tournaments)
CREATE TABLE tournament_participants (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER REFERENCES tournaments(id),
    puuid VARCHAR(78) NOT NULL, -- Riot PUUID
    summoner_name VARCHAR(50),
    region VARCHAR(10),
    rank_tier VARCHAR(20),
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Match data from Riot API
CREATE TABLE matches (
    match_id VARCHAR(50) PRIMARY KEY,
    tournament_id INTEGER REFERENCES tournaments(id),
    game_datetime TIMESTAMP WITH TIME ZONE,
    game_length INTEGER, -- seconds
    game_version VARCHAR(20),
    tft_set_number INTEGER,
    queue_id INTEGER,
    data_version VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Participant performance in each match
CREATE TABLE match_participants (
    id SERIAL PRIMARY KEY,
    match_id VARCHAR(50) REFERENCES matches(match_id),
    puuid VARCHAR(78) NOT NULL,
    placement INTEGER NOT NULL,
    level INTEGER,
    last_round INTEGER,
    players_eliminated INTEGER DEFAULT 0,
    total_damage_to_players INTEGER DEFAULT 0,
    gold_left INTEGER DEFAULT 0,
    time_eliminated INTEGER,
    augments JSONB, -- Array of augment IDs
    traits JSONB, -- Array of trait data
    units JSONB, -- Array of unit data with items
    companion JSONB -- Tactician data
);

-- Tournament points calculation
CREATE TABLE tournament_standings (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER REFERENCES tournaments(id),
    puuid VARCHAR(78) NOT NULL,
    total_points INTEGER DEFAULT 0,
    matches_played INTEGER DEFAULT 0,
    average_placement DECIMAL(3,2),
    first_places INTEGER DEFAULT 0,
    top_four_rate DECIMAL(5,2),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tournament_id, puuid)
);

-- API keys and configuration
CREATE TABLE api_configurations (
    id SERIAL PRIMARY KEY,
    api_key_encrypted TEXT NOT NULL,
    region VARCHAR(10) NOT NULL,
    rate_limit_per_second INTEGER DEFAULT 20,
    rate_limit_per_minute INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin users
CREATE TABLE admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    mfa_secret TEXT,
    mfa_enabled BOOLEAN DEFAULT false,
    role VARCHAR(20) DEFAULT 'admin',
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit logs
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES admin_users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_tournament_participants_tournament_id ON tournament_participants(tournament_id);
CREATE INDEX idx_tournament_participants_puuid ON tournament_participants(puuid);
CREATE INDEX idx_matches_tournament_id ON matches(tournament_id);
CREATE INDEX idx_matches_game_datetime ON matches(game_datetime);
CREATE INDEX idx_match_participants_match_id ON match_participants(match_id);
CREATE INDEX idx_match_participants_puuid ON match_participants(puuid);
CREATE INDEX idx_tournament_standings_tournament_id ON tournament_standings(tournament_id);
CREATE INDEX idx_tournament_standings_points ON tournament_standings(total_points DESC);