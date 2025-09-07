// Tournament Monitoring Worker - Complete System
// Monitors existing Riot TFT tournaments and displays real-time data

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Admin API Routes (for Riot API key management)
      if (path.startsWith('/admin/api/')) {
        if (path === '/admin/api/save-key' && request.method === 'POST') {
          return await handleSaveApiKey(request, env, corsHeaders);
        }
        
        if (path === '/admin/api/test-key' && request.method === 'POST') {
          return await handleTestApiKey(request, env, corsHeaders);
        }
        
        if (path === '/admin/api/list-keys' && request.method === 'GET') {
          return await handleListApiKeys(env, corsHeaders);
        }
      }

      // Tournament Monitoring API Routes
      if (path.startsWith('/api/monitor/')) {
        if (path === '/api/monitor/start' && request.method === 'POST') {
          return await handleStartMonitoring(request, env, corsHeaders);
        }
        
        if (path === '/api/monitor/refresh' && request.method === 'POST') {
          return await handleRefreshTournament(request, env, corsHeaders);
        }
        
        if (path === '/api/monitor/leaderboard' && request.method === 'GET') {
          return await handleGetLeaderboard(request, env, corsHeaders);
        }
        
        if (path === '/api/monitor/matches' && request.method === 'GET') {
          return await handleGetMatches(request, env, corsHeaders);
        }
        
        if (path === '/api/monitor/status' && request.method === 'GET') {
          return await handleGetStatus(request, env, corsHeaders);
        }
      }

      // Public API Routes (for external access)
      if (path.startsWith('/api/')) {
        if (path === '/api/tournament/current' && request.method === 'GET') {
          return await handleGetCurrentTournament(env, corsHeaders);
        }
        
        if (path === '/api/leaderboard/live' && request.method === 'GET') {
          return await handleGetLiveLeaderboard(env, corsHeaders);
        }
      }

      // Serve monitoring interface for /admin route
      if (path === '/admin' || path === '/admin/') {
        return new Response(await getMonitoringHTML(), {
          headers: { 'Content-Type': 'text/html', ...corsHeaders }
        });
      }

      // Serve public tournament view
      if (path === '/' || path === '/tournament') {
        return new Response(await getPublicTournamentHTML(), {
          headers: { 'Content-Type': 'text/html', ...corsHeaders }
        });
      }

      // Default 404
      return jsonResponse({ error: 'Not found' }, 404, corsHeaders);

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({ success: false, error: 'Internal server error' }, 500, corsHeaders);
    }
  }
};

// ============= TOURNAMENT MONITORING =============

async function handleStartMonitoring(request, env, corsHeaders) {
  try {
    const { tournamentId, region, players, startDate, endDate, name } = await request.json();

    if (!tournamentId || !region || !players || players.length === 0) {
      return jsonResponse({ 
        success: false, 
        error: 'Tournament ID, region, and player list are required' 
      }, 400, corsHeaders);
    }

    // Verify all players exist and get their PUUIDs
    const verifiedPlayers = [];
    const riotApiKey = await getDecryptedApiKey('riot', env);
    
    for (const riotId of players) {
      try {
        const [gameName, tagLine] = riotId.split('#');
        if (!gameName || !tagLine) continue;

        const accountResponse = await fetch(
          `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
          { headers: { 'X-Riot-Token': riotApiKey } }
        );

        if (accountResponse.ok) {
          const accountData = await accountResponse.json();
          verifiedPlayers.push({
            riotId: `${accountData.gameName}#${accountData.tagLine}`,
            puuid: accountData.puuid,
            region: getPlayerRegion(region),
            eliminated: false,
            totalPoints: 0,
            matches: [],
            averagePlacement: 0,
            lastSeen: null
          });
        }
      } catch (error) {
        console.error(`Failed to verify player ${riotId}:`, error);
      }
    }

    if (verifiedPlayers.length === 0) {
      return jsonResponse({ 
        success: false, 
        error: 'No valid players found' 
      }, 400, corsHeaders);
    }

    // Create tournament monitoring object
    const tournament = {
      id: tournamentId,
      name: name || `Tournament ${tournamentId}`,
      region: region,
      startDate: startDate || new Date().toISOString(),
      endDate: endDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      players: verifiedPlayers,
      totalPlayers: verifiedPlayers.length,
      activePlayers: verifiedPlayers.length,
      currentDay: 1,
      totalDays: 3,
      status: 'live',
      matches: [],
      dailyResults: [],
      leaderboard: [],
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    // Get initial match data
    await updateTournamentData(tournament, env);

    // Store tournament
    await env.TOURNAMENT_DATA.put(`monitor_${tournamentId}`, JSON.stringify(tournament));
    await env.TOURNAMENT_DATA.put('current_tournament', tournamentId);

    return jsonResponse({ 
      success: true, 
      message: 'Tournament monitoring started',
      tournament: tournament
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Error starting monitoring:', error);
    return jsonResponse({ 
      success: false, 
      error: 'Failed to start monitoring: ' + error.message 
    }, 500, corsHeaders);
  }
}

async function handleRefreshTournament(request, env, corsHeaders) {
  try {
    const { tournamentId } = await request.json();
    
    if (!tournamentId) {
      return jsonResponse({ 
        success: false, 
        error: 'Tournament ID is required' 
      }, 400, corsHeaders);
    }

    // Get tournament
    const tournament = await env.TOURNAMENT_DATA.get(`monitor_${tournamentId}`, 'json');
    if (!tournament) {
      return jsonResponse({ 
        success: false, 
        error: 'Tournament not found' 
      }, 404, corsHeaders);
    }

    // Update tournament data
    await updateTournamentData(tournament, env);

    // Store updated tournament
    await env.TOURNAMENT_DATA.put(`monitor_${tournamentId}`, JSON.stringify(tournament));

    return jsonResponse({ 
      success: true, 
      tournament: tournament
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Error refreshing tournament:', error);
    return jsonResponse({ 
      success: false, 
      error: 'Failed to refresh tournament: ' + error.message 
    }, 500, corsHeaders);
  }
}

async function updateTournamentData(tournament, env) {
  const riotApiKey = await getDecryptedApiKey('riot', env);
  const now = new Date();
  const startDate = new Date(tournament.startDate);
  
  // Calculate current day
  const daysDiff = Math.floor((now - startDate) / (1000 * 60 * 60 * 24)) + 1;
  tournament.currentDay = Math.max(1, Math.min(daysDiff, tournament.totalDays));

  // Update player data
  for (const player of tournament.players) {
    if (player.eliminated) continue;

    try {
      // Get recent TFT matches for this player
      const matchList = await getPlayerMatches(player.puuid, player.region, riotApiKey, startDate);
      
      // Process matches and calculate points
      const newMatches = [];
      let totalPoints = 0;
      let placements = [];

      for (const matchId of matchList) {
        try {
          const matchData = await getMatchDetails(matchId, player.region, riotApiKey);
          if (matchData && matchData.info.game_datetime >= startDate.getTime()) {
            const playerData = matchData.info.participants.find(p => p.puuid === player.puuid);
            if (playerData) {
              const placement = playerData.placement;
              const points = calculatePoints(placement);
              
              newMatches.push({
                matchId: matchId,
                placement: placement,
                points: points,
                timestamp: matchData.info.game_datetime,
                gameLength: matchData.info.game_length
              });

              totalPoints += points;
              placements.push(placement);
            }
          }
        } catch (error) {
          console.error(`Error processing match ${matchId}:`, error);
        }
      }

      // Update player stats
      player.matches = newMatches;
      player.totalPoints = totalPoints;
      player.averagePlacement = placements.length > 0 ? 
        placements.reduce((a, b) => a + b, 0) / placements.length : 0;
      player.lastSeen = newMatches.length > 0 ? 
        new Date(Math.max(...newMatches.map(m => m.timestamp))).toISOString() : null;

      // Check for elimination (no matches in last 12 hours)
      if (player.lastSeen) {
        const lastSeenTime = new Date(player.lastSeen);
        const hoursSinceLastMatch = (now - lastSeenTime) / (1000 * 60 * 60);
        if (hoursSinceLastMatch > 12 && tournament.currentDay > 1) {
          player.eliminated = true;
        }
      }

    } catch (error) {
      console.error(`Error updating player ${player.riotId}:`, error);
    }
  }

  // Update active players count
  tournament.activePlayers = tournament.players.filter(p => !p.eliminated).length;

  // Generate leaderboard
  tournament.leaderboard = tournament.players
    .sort((a, b) => {
      if (a.eliminated && !b.eliminated) return 1;
      if (!a.eliminated && b.eliminated) return -1;
      return b.totalPoints - a.totalPoints;
    })
    .map((player, index) => ({
      rank: index + 1,
      riotId: player.riotId,
      totalPoints: player.totalPoints,
      averagePlacement: player.averagePlacement,
      matches: player.matches.length,
      eliminated: player.eliminated,
      lastSeen: player.lastSeen
    }));

  // Update status
  if (tournament.activePlayers <= 1 || tournament.currentDay > tournament.totalDays) {
    tournament.status = 'completed';
  } else if (tournament.activePlayers < tournament.totalPlayers * 0.5) {
    tournament.status = 'finals';
  } else {
    tournament.status = 'live';
  }

  tournament.lastUpdated = now.toISOString();
}

async function getPlayerMatches(puuid, region, apiKey, startDate) {
  const startTime = Math.floor(startDate.getTime() / 1000);
  
  try {
    const response = await fetch(
      `https://${region}.api.riotgames.com/tft/match/v1/matches/by-puuid/${puuid}/ids?start=0&count=20&startTime=${startTime}`,
      { headers: { 'X-Riot-Token': apiKey } }
    );

    if (response.ok) {
      return await response.json();
    } else {
      console.error(`Failed to get matches for ${puuid}: ${response.status}`);
      return [];
    }
  } catch (error) {
    console.error(`Error fetching matches for ${puuid}:`, error);
    return [];
  }
}

async function getMatchDetails(matchId, region, apiKey) {
  try {
    const response = await fetch(
      `https://${region}.api.riotgames.com/tft/match/v1/matches/${matchId}`,
      { headers: { 'X-Riot-Token': apiKey } }
    );

    if (response.ok) {
      return await response.json();
    } else {
      console.error(`Failed to get match details for ${matchId}: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching match details for ${matchId}:`, error);
    return null;
  }
}

function calculatePoints(placement) {
  // Standard TFT tournament scoring
  const pointsMap = {
    1: 8, 2: 7, 3: 6, 4: 5,
    5: 4, 6: 3, 7: 2, 8: 1
  };
  return pointsMap[placement] || 0;
}

function getPlayerRegion(region) {
  const regionMap = {
    'americas': 'na1',
    'asia': 'kr',
    'europe': 'euw1'
  };
  return regionMap[region] || 'na1';
}

// ============= API HANDLERS =============

async function handleGetLeaderboard(request, env, corsHeaders) {
  try {
    const url = new URL(request.url);
    const tournamentId = url.searchParams.get('tournamentId');
    
    if (!tournamentId) {
      return jsonResponse({ 
        success: false, 
        error: 'Tournament ID is required' 
      }, 400, corsHeaders);
    }

    const tournament = await env.TOURNAMENT_DATA.get(`monitor_${tournamentId}`, 'json');
    if (!tournament) {
      return jsonResponse({ 
        success: false, 
        error: 'Tournament not found' 
      }, 404, corsHeaders);
    }

    return jsonResponse({ 
      success: true, 
      leaderboard: tournament.leaderboard,
      lastUpdated: tournament.lastUpdated
    }, 200, corsHeaders);

  } catch (error) {
    return jsonResponse({ 
      success: false, 
      error: 'Failed to get leaderboard: ' + error.message 
    }, 500, corsHeaders);
  }
}

async function handleGetCurrentTournament(env, corsHeaders) {
  try {
    const currentTournamentId = await env.TOURNAMENT_DATA.get('current_tournament');
    if (!currentTournamentId) {
      return jsonResponse({ 
        success: false, 
        error: 'No active tournament' 
      }, 404, corsHeaders);
    }

    const tournament = await env.TOURNAMENT_DATA.get(`monitor_${currentTournamentId}`, 'json');
    if (!tournament) {
      return jsonResponse({ 
        success: false, 
        error: 'Tournament data not found' 
      }, 404, corsHeaders);
    }

    return jsonResponse({ 
      success: true, 
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        currentDay: tournament.currentDay,
        totalDays: tournament.totalDays,
        activePlayers: tournament.activePlayers,
        totalPlayers: tournament.totalPlayers,
        leaderboard: tournament.leaderboard.slice(0, 10), // Top 10
        lastUpdated: tournament.lastUpdated
      }
    }, 200, corsHeaders);

  } catch (error) {
    return jsonResponse({ 
      success: false, 
      error: 'Failed to get current tournament: ' + error.message 
    }, 500, corsHeaders);
  }
}

// ============= API KEY MANAGEMENT (SIMPLIFIED) =============

async function handleSaveApiKey(request, env, corsHeaders) {
  try {
    const { provider, apiKey, metadata } = await request.json();

    if (!provider || !apiKey || provider !== 'riot') {
      return jsonResponse({ 
        success: false, 
        error: 'Only Riot API key is required for monitoring' 
      }, 400, corsHeaders);
    }

    // Encrypt and store API key
    const encryptedData = await encryptApiKey(apiKey, env);
    const keyData = {
      encryptedKey: encryptedData.encryptedKey,
      iv: encryptedData.iv,
      provider: provider,
      metadata: metadata || {},
      createdAt: new Date().toISOString()
    };

    await env.API_KEYS.put(`${provider}_api_key`, JSON.stringify(keyData));

    return jsonResponse({ 
      success: true, 
      message: 'Riot API key saved successfully' 
    }, 200, corsHeaders);

  } catch (error) {
    return jsonResponse({ 
      success: false, 
      error: 'Failed to save API key: ' + error.message 
    }, 500, corsHeaders);
  }
}

async function handleTestApiKey(request, env, corsHeaders) {
  try {
    const { provider } = await request.json();

    if (provider !== 'riot') {
      return jsonResponse({ 
        success: false, 
        error: 'Only Riot API testing is supported' 
      }, 400, corsHeaders);
    }

    const apiKey = await getDecryptedApiKey('riot', env);
    
    // Test with a simple API call
    const response = await fetch(
      'https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Faker/T1',
      { headers: { 'X-Riot-Token': apiKey } }
    );

    if (response.ok) {
      return jsonResponse({
        success: true,
        message: 'Riot API connection successful'
      }, 200, corsHeaders);
    } else {
      return jsonResponse({
        success: false,
        error: `Riot API error: ${response.status}`
      }, 400, corsHeaders);
    }
  } catch (error) {
    return jsonResponse({
      success: false,
      error: 'Failed to test API: ' + error.message
    }, 500, corsHeaders);
  }
}

async function handleListApiKeys(env, corsHeaders) {
  try {
    const riotKey = await env.API_KEYS.get('riot_api_key', 'json');
    const keys = [];
    
    if (riotKey) {
      keys.push({
        provider: 'riot',
        createdAt: riotKey.createdAt,
        status: 'stored'
      });
    }

    return jsonResponse({ success: true, keys }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ 
      success: false, 
      error: 'Failed to list keys: ' + error.message 
    }, 500, corsHeaders);
  }
}

// ============= ENCRYPTION FUNCTIONS =============

async function encryptApiKey(apiKey, env) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ADMIN_TOKEN.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    keyMaterial,
    new TextEncoder().encode(apiKey)
  );

  return {
    encryptedKey: Array.from(new Uint8Array(encryptedBuffer)).map(b => b.toString(16).padStart(2, '0')).join(''),
    iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('')
  };
}

async function decryptApiKey(encryptedData, env) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ADMIN_TOKEN.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  const encryptedKey = new Uint8Array(encryptedData.encryptedKey.match(/.{2}/g).map(byte => parseInt(byte, 16)));
  const iv = new Uint8Array(encryptedData.iv.match(/.{2}/g).map(byte => parseInt(byte, 16)));

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    keyMaterial,
    encryptedKey
  );

  return new TextDecoder().decode(decryptedBuffer);
}

async function getDecryptedApiKey(provider, env) {
  const keyData = await env.API_KEYS.get(`${provider}_api_key`, 'json');
  if (!keyData) {
    throw new Error(`No ${provider} API key found. Please add it in the admin panel.`);
  }
  return await decryptApiKey(keyData, env);
}

// ============= UTILITY FUNCTIONS =============

function jsonResponse(data, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...additionalHeaders
    }
  });
}

async function getMonitoringHTML() {
  // Return the monitoring interface from the previous artifact
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TFT Tournament Monitor - Admin</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); min-height: 100vh; color: #333; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: rgba(255, 255, 255, 0.95); border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1); }
        .header h1 { color: #1e3c72; font-size: 2.2em; margin-bottom: 8px; }
        .card { background: rgba(255, 255, 255, 0.95); border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1); }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 600; color: #333; }
        .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 10px 12px; border: 2px solid #e9ecef; border-radius: 6px; font-size: 1em; }
        .btn { padding: 10px 20px; border: none; border-radius: 6px; font-size: 1em; font-weight: 600; cursor: pointer; transition: all 0.3s ease; margin-right: 10px; }
        .btn-primary { background: #1e3c72; color: white; }
        .btn-primary:hover { background: #2a5298; }
        .btn-success { background: #28a745; color: white; }
        .btn-test { background: #17a2b8; color: white; }
        .alert { padding: 16px; border-radius: 6px; margin-bottom: 20px; display: none; }
        .alert.show { display: block; }
        .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .status { margin-top: 12px; padding: 8px 16px; border-radius: 6px; font-size: 0.9em; }
        .status-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .status-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .tournament-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
        .leaderboard { margin-top: 20px; }
        .player-row { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8f9fa; border-radius: 6px; border-left: 4px solid #1e3c72; margin-bottom: 8px; }
        .player-rank { font-weight: bold; color: #1e3c72; min-width: 30px; }
        .player-info { flex: 1; margin-left: 15px; }
        .player-stats { text-align: right; }
        .elimination-indicator { background: #dc3545; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 10px; }
        .refresh-indicator { display: none; align-items: center; gap: 8px; color: #28a745; font-size: 0.9em; }
        .refresh-indicator.show { display: flex; }
        .spinner { width: 16px; height: 16px; border: 2px solid #e9ecef; border-top: 2px solid #28a745; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔧 TFT Tournament Monitor - Admin</h1>
            <p>Monitor existing Riot TFT tournaments with real-time tracking</p>
            <div class="refresh-indicator" id="refresh-indicator">
                <div class="spinner"></div>
                Updating tournament data...
            </div>
        </div>

        <div class="alert" id="alert"></div>

        <!-- API Key Setup -->
        <div class="card">
            <h3>🔐 Riot API Configuration</h3>
            <div class="form-group">
                <label for="riot-key">Riot API Key</label>
                <input type="password" id="riot-key" placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
            </div>
            <button class="btn btn-primary" onclick="saveRiotKey()">💾 Save API Key</button>
            <button class="btn btn-test" onclick="testRiotKey()">🧪 Test Connection</button>
            <div id="riot-status"></div>
        </div>

        <!-- Tournament Monitoring Setup -->
        <div class="card">
            <h3>🎯 Tournament Monitoring Setup</h3>
            <div class="tournament-grid">
                <div>
                    <div class="form-group">
                        <label for="tournament-id">Tournament ID</label>
                        <input type="text" id="tournament-id" placeholder="e.g., AMER_TRIALS_2024_1">
                    </div>
                    <div class="form-group">
                        <label for="tournament-name">Tournament Name</label>
                        <input type="text" id="tournament-name" placeholder="AMER Tactician's Trials I">
                    </div>
                    <div class="form-group">
                        <label for="tournament-region">Region</label>
                        <select id="tournament-region">
                            <option value="americas">Americas</option>
                            <option value="asia">Asia</option>
                            <option value="europe">Europe</option>
                        </select>
                    </div>
                </div>
                <div>
                    <div class="form-group">
                        <label for="player-list">Player List (one per line)</label>
                        <textarea id="player-list" rows="6" placeholder="GameName#TAG&#10;Player2#NA1&#10;Player3#EUW"></textarea>
                    </div>
                </div>
            </div>
            <button class="btn btn-primary" onclick="startMonitoring()">🔍 Start Monitoring</button>
            <button class="btn btn-success" onclick="refreshData()">🔄 Refresh Data</button>
        </div>

        <!-- Tournament Status -->
        <div class="card" id="tournament-status" style="display: none;">
            <h3>🏆 Tournament Status</h3>
            <div id="tournament-info"></div>
        </div>

        <!-- Live Leaderboard -->
        <div class="card" id="leaderboard-section" style="display: none;">
            <h3>📈 Live Leaderboard</h3>
            <div class="leaderboard" id="leaderboard"></div>
        </div>
    </div>

    <script>
        let monitoringInterval;
        let currentTournament = null;

        function showAlert(message, type = 'success') {
            const alert = document.getElementById('alert');
            alert.className = \`alert alert-\${type} show\`;
            alert.textContent = message;
            setTimeout(() => alert.classList.remove('show'), 5000);
        }

        function updateStatus(elementId, success, message) {
            const statusEl = document.getElementById(elementId);
            statusEl.innerHTML = \`<div class="status status-\${success ? 'success' : 'error'}">\${success ? '✅' : '❌'} \${message}</div>\`;
        }

        async function saveRiotKey() {
            const apiKey = document.getElementById('riot-key').value.trim();
            
            if (!apiKey) {
                showAlert('Please enter a Riot API key', 'error');
                return;
            }

            try {
                const response = await fetch('/admin/api/save-key', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider: 'riot',
                        apiKey: apiKey
                    })
                });

                const result = await response.json();
                if (result.success) {
                    showAlert('Riot API key saved successfully!', 'success');
                    document.getElementById('riot-key').value = '';
                    updateStatus('riot-status', true, 'API Key Saved');
                } else {
                    showAlert('Failed to save: ' + result.error, 'error');
                }
            } catch (error) {
                showAlert('Error: ' + error.message, 'error');
            }
        }

        async function testRiotKey() {
            try {
                const response = await fetch('/admin/api/test-key', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider: 'riot' })
                });

                const result = await response.json();
                if (result.success) {
                    showAlert('Riot API connection successful!', 'success');
                    updateStatus('riot-status', true, 'API Connected & Working');
                } else {
                    showAlert('Connection failed: ' + result.error, 'error');
                    updateStatus('riot-status', false, 'Connection Failed');
                }
            } catch (error) {
                showAlert('Test failed: ' + error.message, 'error');
            }
        }

        async function startMonitoring() {
            const tournamentId = document.getElementById('tournament-id').value.trim();
            const tournamentName = document.getElementById('tournament-name').value.trim();
            const region = document.getElementById('tournament-region').value;
            const playerList = document.getElementById('player-list').value.trim();

            if (!tournamentId) {
                showAlert('Please enter a tournament ID', 'error');
                return;
            }

            const players = playerList.split('\\n').filter(p => p.trim()).map(p => p.trim());
            if (players.length === 0) {
                showAlert('Please enter at least one player', 'error');
                return;
            }

            try {
                const response = await fetch('/api/monitor/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tournamentId: tournamentId,
                        name: tournamentName,
                        region: region,
                        players: players
                    })
                });

                const result = await response.json();
                if (result.success) {
                    currentTournament = result.tournament;
                    showTournamentData(result.tournament);
                    
                    // Start auto-refresh every 2 minutes
                    if (monitoringInterval) clearInterval(monitoringInterval);
                    monitoringInterval = setInterval(refreshData, 120000);
                    
                    showAlert('Tournament monitoring started!', 'success');
                } else {
                    showAlert('Failed to start monitoring: ' + result.error, 'error');
                }
            } catch (error) {
                showAlert('Error: ' + error.message, 'error');
            }
        }

        async function refreshData() {
            if (!currentTournament) {
                showAlert('No tournament being monitored', 'error');
                return;
            }

            document.getElementById('refresh-indicator').classList.add('show');

            try {
                const response = await fetch('/api/monitor/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tournamentId: currentTournament.id
                    })
                });

                const result = await response.json();
                if (result.success) {
                    currentTournament = result.tournament;
                    showTournamentData(result.tournament);
                    showAlert('Data refreshed successfully!', 'success');
                } else {
                    showAlert('Failed to refresh: ' + result.error, 'error');
                }
            } catch (error) {
                showAlert('Refresh error: ' + error.message, 'error');
            } finally {
                document.getElementById('refresh-indicator').classList.remove('show');
            }
        }

        function showTournamentData(tournament) {
            // Show tournament status
            const statusEl = document.getElementById('tournament-status');
            const infoEl = document.getElementById('tournament-info');
            
            infoEl.innerHTML = \`
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <h4 style="color: #1e3c72; margin-bottom: 10px;">\${tournament.name}</h4>
                        <p><strong>Tournament ID:</strong> \${tournament.id}</p>
                        <p><strong>Region:</strong> \${tournament.region.toUpperCase()}</p>
                        <p><strong>Day:</strong> \${tournament.currentDay} of \${tournament.totalDays}</p>
                        <p><strong>Status:</strong> <span style="text-transform: capitalize;">\${tournament.status}</span></p>
                    </div>
                    <div>
                        <p><strong>Total Players:</strong> \${tournament.totalPlayers}</p>
                        <p><strong>Active Players:</strong> \${tournament.activePlayers}</p>
                        <p><strong>Eliminated:</strong> \${tournament.totalPlayers - tournament.activePlayers}</p>
                        <p><strong>Last Updated:</strong> \${new Date(tournament.lastUpdated).toLocaleTimeString()}</p>
                    </div>
                </div>
            \`;
            statusEl.style.display = 'block';

            // Show leaderboard
            showLeaderboard(tournament.leaderboard);
        }

        function showLeaderboard(leaderboard) {
            const leaderboardEl = document.getElementById('leaderboard-section');
            const boardEl = document.getElementById('leaderboard');
            
            if (!leaderboard || leaderboard.length === 0) {
                boardEl.innerHTML = '<p>No leaderboard data available.</p>';
                leaderboardEl.style.display = 'block';
                return;
            }

            const leaderboardHtml = leaderboard.map((player, index) => \`
                <div class="player-row" style="\${player.eliminated ? 'opacity: 0.6;' : ''}">
                    <div class="player-rank">#\${player.rank}</div>
                    <div class="player-info">
                        <div style="font-weight: 600;">
                            \${player.riotId}
                            \${player.eliminated ? '<span class="elimination-indicator">ELIMINATED</span>' : ''}
                        </div>
                        <div style="font-size: 0.9em; color: #666;">
                            Matches: \${player.matches} • Avg Placement: \${player.averagePlacement ? player.averagePlacement.toFixed(1) : 'N/A'}
                        </div>
                    </div>
                    <div class="player-stats">
                        <div><strong>\${player.totalPoints}</strong> points</div>
                        <div style="font-size: 0.9em; color: #666;">
                            \${player.lastSeen ? 'Last seen: ' + new Date(player.lastSeen).toLocaleDateString() : 'No matches'}
                        </div>
                    </div>
                </div>
            \`).join('');

            boardEl.innerHTML = leaderboardHtml;
            leaderboardEl.style.display = 'block';
        }

        // Auto-save form data
        document.addEventListener('DOMContentLoaded', function() {
            const fields = ['tournament-id', 'tournament-name', 'tournament-region', 'player-list'];
            fields.forEach(field => {
                const el = document.getElementById(field);
                const saved = localStorage.getItem('tft_monitor_' + field);
                if (saved) el.value = saved;
                
                el.addEventListener('input', function() {
                    localStorage.setItem('tft_monitor_' + field, el.value);
                });
            });
        });
    </script>
</body>
</html>`;
}

async function getPublicTournamentHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TFT Tournament - Live Standings</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); min-height: 100vh; color: #333; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: rgba(255, 255, 255, 0.95); border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1); text-align: center; }
        .card { background: rgba(255, 255, 255, 0.95); border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1); }
        .status-live { background: #28a745; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; display: inline-block; margin: 10px 0; }
        .player-row { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8f9fa; border-radius: 6px; margin-bottom: 8px; border-left: 4px solid #1e3c72; }
        .top-3 { border-left-color: #ffd700; background: #fffbf0; }
        .eliminated { opacity: 0.6; border-left-color: #dc3545; }
        .auto-refresh { text-align: center; margin: 20px 0; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏆 TFT Tournament</h1>
            <div id="tournament-header"></div>
        </div>

        <div class="card">
            <h3>📈 Live Standings</h3>
            <div id="leaderboard"></div>
            <div class="auto-refresh">
                <p>Page automatically refreshes every 60 seconds</p>
                <p id="last-update"></p>
            </div>
        </div>
    </div>

    <script>
        async function loadTournamentData() {
            try {
                const response = await fetch('/api/tournament/current');
                const result = await response.json();
                
                if (result.success) {
                    displayTournament(result.tournament);
                } else {
                    document.getElementById('tournament-header').innerHTML = '<p>No active tournament</p>';
                }
            } catch (error) {
                document.getElementById('tournament-header').innerHTML = '<p>Error loading tournament data</p>';
            }
        }

        function displayTournament(tournament) {
            document.getElementById('tournament-header').innerHTML = \`
                <h2>\${tournament.name}</h2>
                <div class="status-live">Day \${tournament.currentDay} of \${tournament.totalDays} • \${tournament.activePlayers} players remaining</div>
            \`;

            const leaderboardHtml = tournament.leaderboard.map((player, index) => \`
                <div class="player-row \${index < 3 ? 'top-3' : ''} \${player.eliminated ? 'eliminated' : ''}">
                    <div>
                        <strong>#\${index + 1} \${player.riotId}</strong>
                        \${player.eliminated ? ' <span style="color: #dc3545;">(Eliminated)</span>' : ''}
                    </div>
                    <div>
                        <strong>\${player.totalPoints}</strong> points
                    </div>
                </div>
            \`).join('');

            document.getElementById('leaderboard').innerHTML = leaderboardHtml;
            document.getElementById('last-update').textContent = 
                \`Last updated: \${new Date(tournament.lastUpdated).toLocaleString()}\`;
        }

        // Load data on page load
        loadTournamentData();

        // Auto-refresh every 60 seconds
        setInterval(loadTournamentData, 60000);
    </script>
</body>
</html>`;
}