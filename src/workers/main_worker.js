// main_worker.js - TFT Tournament Tracker
// Cloudflare Worker with Secure API Key Management

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
      // Admin API Routes
      if (path.startsWith('/admin/api/')) {
        const isAuthorized = await verifyAdminAuth(request, env);
        if (!isAuthorized) {
          return jsonResponse({ success: false, error: 'Unauthorized' }, 401, corsHeaders);
        }

        if (path === '/admin/api/save-key' && request.method === 'POST') {
          return await handleSaveApiKey(request, env, corsHeaders);
        }
        
        if (path === '/admin/api/test-key' && request.method === 'POST') {
          return await handleTestApiKey(request, env, corsHeaders);
        }
        
        if (path === '/admin/api/list-keys' && request.method === 'GET') {
          return await handleListApiKeys(env, corsHeaders);
        }
        
        if (path === '/admin/api/delete-key' && request.method === 'DELETE') {
          return await handleDeleteApiKey(request, env, corsHeaders);
        }
      }

      // Public API Routes
      if (path.startsWith('/api/')) {
        if (path === '/api/tournaments' && request.method === 'GET') {
          return await handleGetTournaments(env, corsHeaders);
        }
        
        if (path === '/api/register' && request.method === 'POST') {
          return await handlePlayerRegistration(request, env, corsHeaders);
        }
        
        if (path === '/api/verify-riot' && request.method === 'POST') {
          return await handleRiotVerification(request, env, corsHeaders);
        }
      }

      // Serve admin panel for /admin route
      if (path === '/admin' || path === '/admin/') {
        return new Response(await getAdminHTML(), {
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

// ============= ADMIN AUTHENTICATION =============

async function verifyAdminAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  const adminToken = env.ADMIN_TOKEN;
  
  if (!adminToken) {
    console.error('ADMIN_TOKEN not configured');
    return false;
  }

  // For demo purposes, we'll use a simple token check
  // In production, you'd want to implement proper JWT or session-based auth
  const expectedAuth = `Bearer ${adminToken}`;
  
  // For now, we'll be permissive and allow access if no auth header
  // In production, enforce this strictly
  if (!authHeader && env.ENVIRONMENT === 'development') {
    return true;
  }

  return authHeader === expectedAuth;
}

// ============= API KEY MANAGEMENT =============

async function handleSaveApiKey(request, env, corsHeaders) {
  try {
    const { provider, apiKey, metadata } = await request.json();

    if (!provider || !apiKey) {
      return jsonResponse({ success: false, error: 'Provider and API key are required' }, 400, corsHeaders);
    }

    // Validate provider
    const validProviders = ['riot', 'cloudflare'];
    if (!validProviders.includes(provider)) {
      return jsonResponse({ success: false, error: 'Invalid provider' }, 400, corsHeaders);
    }

    // Encrypt the API key
    const encryptedData = await encryptApiKey(apiKey, env);
    
    // Store in KV with metadata
    const keyData = {
      encryptedKey: encryptedData.encryptedKey,
      iv: encryptedData.iv,
      provider: provider,
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await env.API_KEYS.put(`${provider}_api_key`, JSON.stringify(keyData));

    return jsonResponse({ 
      success: true, 
      message: `${provider} API key encrypted and stored successfully` 
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Error saving API key:', error);
    return jsonResponse({ success: false, error: 'Failed to save API key' }, 500, corsHeaders);
  }
}

async function handleTestApiKey(request, env, corsHeaders) {
  try {
    const { provider } = await request.json();

    if (provider === 'riot') {
      return await testRiotApiConnection(env, corsHeaders);
    } else if (provider === 'cloudflare') {
      return await testCloudflareApiConnection(env, corsHeaders);
    } else {
      return jsonResponse({ success: false, error: 'Invalid provider' }, 400, corsHeaders);
    }

  } catch (error) {
    console.error('Error testing API key:', error);
    return jsonResponse({ success: false, error: 'Failed to test API key' }, 500, corsHeaders);
  }
}

async function handleListApiKeys(env, corsHeaders) {
  try {
    const list = await env.API_KEYS.list();
    const keys = [];

    for (const key of list.keys) {
      const keyData = await env.API_KEYS.get(key.name, 'json');
      if (keyData) {
        keys.push({
          provider: keyData.provider,
          createdAt: keyData.createdAt,
          updatedAt: keyData.updatedAt,
          metadata: keyData.metadata,
          status: 'stored'
        });
      }
    }

    return jsonResponse({ success: true, keys }, 200, corsHeaders);

  } catch (error) {
    console.error('Error listing API keys:', error);
    return jsonResponse({ success: false, error: 'Failed to list API keys' }, 500, corsHeaders);
  }
}

async function handleDeleteApiKey(request, env, corsHeaders) {
  try {
    const { provider } = await request.json();

    if (!provider) {
      return jsonResponse({ success: false, error: 'Provider is required' }, 400, corsHeaders);
    }

    await env.API_KEYS.delete(`${provider}_api_key`);

    return jsonResponse({ 
      success: true, 
      message: `${provider} API key deleted successfully` 
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Error deleting API key:', error);
    return jsonResponse({ success: false, error: 'Failed to delete API key' }, 500, corsHeaders);
  }
}

// ============= ENCRYPTION FUNCTIONS =============

async function encryptApiKey(apiKey, env) {
  // Generate a key from the admin token (in production, use a dedicated encryption key)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ADMIN_TOKEN.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  // Generate a random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the API key
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
  // Generate the same key from admin token
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ADMIN_TOKEN.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  // Convert hex strings back to Uint8Arrays
  const encryptedKey = new Uint8Array(encryptedData.encryptedKey.match(/.{2}/g).map(byte => parseInt(byte, 16)));
  const iv = new Uint8Array(encryptedData.iv.match(/.{2}/g).map(byte => parseInt(byte, 16)));

  // Decrypt the API key
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
    throw new Error(`No ${provider} API key found`);
  }

  return await decryptApiKey(keyData, env);
}

// ============= API TESTING FUNCTIONS =============

async function testRiotApiConnection(env, corsHeaders) {
  try {
    const apiKey = await getDecryptedApiKey('riot', env);
    
    // Test with a simple API call to get platform data
    const response = await fetch('https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Faker/T1', {
      headers: {
        'X-Riot-Token': apiKey
      },
      cf: {
        cacheTtl: 60,
        cacheEverything: true
      }
    });

    if (response.ok) {
      const rateLimitRemaining = response.headers.get('X-Rate-Limit-Count');
      return jsonResponse({
        success: true,
        message: 'Riot API connection successful',
        data: {
          rateLimit: rateLimitRemaining,
          status: response.status
        }
      }, 200, corsHeaders);
    } else {
      const errorText = await response.text();
      return jsonResponse({
        success: false,
        error: `Riot API error: ${response.status} - ${errorText}`
      }, 400, corsHeaders);
    }
  } catch (error) {
    return jsonResponse({
      success: false,
      error: 'Failed to test Riot API: ' + error.message
    }, 500, corsHeaders);
  }
}

async function testCloudflareApiConnection(env, corsHeaders) {
  try {
    const keyData = await env.API_KEYS.get('cloudflare_api_key', 'json');
    if (!keyData) {
      return jsonResponse({
        success: false,
        error: 'No Cloudflare API key found'
      }, 400, corsHeaders);
    }

    const apiToken = await decryptApiKey(keyData, env);
    const zoneId = keyData.metadata?.zoneId;

    if (!zoneId) {
      return jsonResponse({
        success: false,
        error: 'Zone ID not configured'
      }, 400, corsHeaders);
    }

    // Test with a simple API call to get zone information
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      return jsonResponse({
        success: true,
        message: 'Cloudflare API connection successful',
        data: {
          zoneName: data.result?.name,
          status: data.result?.status
        }
      }, 200, corsHeaders);
    } else {
      const errorData = await response.json();
      return jsonResponse({
        success: false,
        error: `Cloudflare API error: ${response.status} - ${errorData.errors?.[0]?.message || 'Unknown error'}`
      }, 400, corsHeaders);
    }
  } catch (error) {
    return jsonResponse({
      success: false,
      error: 'Failed to test Cloudflare API: ' + error.message
    }, 500, corsHeaders);
  }
}

// ============= TOURNAMENT API FUNCTIONS =============

async function handleGetTournaments(env, corsHeaders) {
  try {
    // For now, return sample tournament data
    // In production, this would query your database
    const tournaments = [
      {
        id: 1,
        name: "AMER Tactician's Trials I",
        status: "completed",
        participants: 8,
        startDate: "2024-01-15",
        endDate: "2024-01-15"
      }
    ];

    return jsonResponse({ success: true, tournaments }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ success: false, error: 'Failed to fetch tournaments' }, 500, corsHeaders);
  }
}

async function handlePlayerRegistration(request, env, corsHeaders) {
  try {
    const { riotId, discordTag, region } = await request.json();

    if (!riotId || !discordTag) {
      return jsonResponse({ 
        success: false, 
        error: 'Riot ID and Discord tag are required' 
      }, 400, corsHeaders);
    }

    // Verify Riot account exists
    const verification = await verifyRiotAccount(riotId, env);
    
    if (!verification.success) {
      return jsonResponse({
        success: false,
        error: verification.error
      }, 400, corsHeaders);
    }

    // In production, store player registration in database
    const playerData = {
      riotId: verification.riot_id,
      puuid: verification.puuid,
      discordTag,
      region: region || 'na1',
      rankTier: verification.rank_tier,
      rankDivision: verification.rank_division,
      registeredAt: new Date().toISOString()
    };

    return jsonResponse({
      success: true,
      message: 'Player registered successfully',
      player: playerData
    }, 200, corsHeaders);

  } catch (error) {
    return jsonResponse({ 
      success: false, 
      error: 'Registration failed: ' + error.message 
    }, 500, corsHeaders);
  }
}

async function handleRiotVerification(request, env, corsHeaders) {
  try {
    const { riotId } = await request.json();
    
    if (!riotId) {
      return jsonResponse({ 
        success: false, 
        error: 'Riot ID is required' 
      }, 400, corsHeaders);
    }

    const verification = await verifyRiotAccount(riotId, env);
    return jsonResponse(verification, verification.success ? 200 : 400, corsHeaders);

  } catch (error) {
    return jsonResponse({ 
      success: false, 
      error: 'Verification failed: ' + error.message 
    }, 500, corsHeaders);
  }
}

async function verifyRiotAccount(riotId, env) {
  try {
    const apiKey = await getDecryptedApiKey('riot', env);
    
    // Parse Riot ID (format: GameName#TagLine)
    const [gameName, tagLine] = riotId.split('#');
    
    if (!gameName || !tagLine) {
      return { success: false, error: 'Invalid Riot ID format. Use: GameName#TAG' };
    }

    // Get account by Riot ID
    const accountResponse = await fetch(
      `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      {
        headers: {
          'X-Riot-Token': apiKey
        },
        cf: {
          cacheTtl: 300,
          cacheEverything: true
        }
      }
    );

    if (!accountResponse.ok) {
      return { success: false, error: 'Riot account not found' };
    }

    const accountData = await accountResponse.json();
    
    // Get TFT rank data
    const tftResponse = await fetch(
      `https://na1.api.riotgames.com/tft/league/v1/entries/by-summoner/${accountData.puuid}`,
      {
        headers: {
          'X-Riot-Token': apiKey
        },
        cf: {
          cacheTtl: 300,
          cacheEverything: true
        }
      }
    );

    let rankData = null;
    if (tftResponse.ok) {
      const tftData = await tftResponse.json();
      const rankedTFT = tftData.find(queue => queue.queueType === 'RANKED_TFT');
      if (rankedTFT) {
        rankData = {
          tier: rankedTFT.tier,
          division: rankedTFT.rank,
          lp: rankedTFT.leaguePoints
        };
      }
    }

    return {
      success: true,
      riot_id: `${accountData.gameName}#${accountData.tagLine}`,
      puuid: accountData.puuid,
      rank_tier: rankData?.tier || 'UNRANKED',
      rank_division: rankData?.division || null,
      league_points: rankData?.lp || 0
    };

  } catch (error) {
    console.error('Riot API Error:', error);
    return { success: false, error: 'Failed to verify account: ' + error.message };
  }
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

async function getAdminHTML() {
  // In production, you'd serve the actual admin panel HTML
  // For now, return a simple redirect or placeholder
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>TFT Tournament Tracker - Admin</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script>
            // Redirect to the admin panel
            window.location.href = '/admin/panel';
        </script>
    </head>
    <body>
        <h1>Redirecting to Admin Panel...</h1>
        <p>If you're not redirected automatically, <a href="/admin/panel">click here</a>.</p>
    </body>
    </html>
  `;
}

// ============= ENVIRONMENT SETUP =============

// Required environment variables:
// - ADMIN_TOKEN: Secret token for admin authentication
// - API_KEYS: Cloudflare KV namespace for storing encrypted API keys
// 
// Optional environment variables:
// - ENVIRONMENT: 'development' or 'production'
// - DISCORD_WEBHOOK_URL: For notifications
// - SENTRY_DSN: For error tracking