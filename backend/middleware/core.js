// CORS Middleware - TFT Tournament Tracker
// Handles Cross-Origin Resource Sharing for API endpoints

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-ID',
    'Access-Control-Max-Age': '86400', // 24 hours
};

export const handleCORS = () => {
    return new Response(null, { 
        status: 204,
        headers: corsHeaders 
    });
};

export const addCORSHeaders = (response) => {
    // Add CORS headers to an existing response
    Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
    });
    return response;
};