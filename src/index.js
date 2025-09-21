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
