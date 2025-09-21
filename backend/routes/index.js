// Complete route handler with all controllers
import { corsHeaders, handleCORS } from '../middleware/cors.js';

// Import controllers
import * as authController from '../controllers/auth.js';
import * as playerController from '../controllers/player.js';
import * as gameResultsController from '../controllers/gameResults.js';
import * as lobbyController from '../controllers/lobby.js';

export const handleRequest = async (request, env, ctx) => {
    const url = new URL(request.url);
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
        return handleCORS();
    }

    // Apply authentication middleware for protected routes
    if (url.pathname.startsWith('/api/admin/')) {
        const authResult = await authController.authenticateMiddleware(request, env);
        if (!authResult.authenticated) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Authentication required'
            }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }

    // Route handling
    try {
        // Health check
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

        // Auth routes
        if (url.pathname === '/api/auth/login' && method === 'POST') {
            return authController.login(request, env);
        }
        if (url.pathname === '/api/auth/logout' && method === 'POST') {
            return authController.logout(request, env);
        }
        if (url.pathname === '/api/auth/me' && method === 'GET') {
            return authController.getCurrentUser(request, env);
        }

        // Public player routes
        if (url.pathname === '/api/players' && method === 'GET') {
            return playerController.getAllPlayers(request, env);
        }
        if (url.pathname.match(/^\/api\/players\/\d+$/) && method === 'GET') {
            return playerController.getPlayerById(request, env);
        }

        // Admin player routes
        if (url.pathname === '/api/admin/players' && method === 'POST') {
            return playerController.createPlayer(request, env);
        }
        if (url.pathname.match(/^\/api\/admin\/players\/\d+$/) && method === 'PUT') {
            return playerController.updatePlayer(request, env);
        }

        // Game results routes
        if (url.pathname === '/api/admin/games/results' && method === 'POST') {
            return gameResultsController.submitGameResults(request, env);
        }

        // Lobby routes  
        if (url.pathname === '/api/admin/lobbies' && method === 'POST') {
            return lobbyController.createLobbies(request, env);
        }

        // Root endpoint
        if (url.pathname === '/' || url.pathname === '/api') {
            return new Response(JSON.stringify({
                message: 'TFT Tournament Tracker API',
                version: '1.0.0',
                environment: env.ENVIRONMENT,
                endpoints: {
                    health: '/api/health',
                    auth: {
                        login: 'POST /api/auth/login',
                        logout: 'POST /api/auth/logout',
                        me: 'GET /api/auth/me'
                    },
                    players: {
                        list: 'GET /api/players',
                        get: 'GET /api/players/:id',
                        create: 'POST /api/admin/players',
                        update: 'PUT /api/admin/players/:id'
                    },
                    games: {
                        submit: 'POST /api/admin/games/results'
                    },
                    lobbies: {
                        create: 'POST /api/admin/lobbies'
                    }
                }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 404 for unmatched routes
        return new Response(JSON.stringify({
            error: 'Route not found',
            path: url.pathname
        }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Request error:', error);
        return new Response(JSON.stringify({
            error: 'Internal server error',
            timestamp: new Date().toISOString()
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};