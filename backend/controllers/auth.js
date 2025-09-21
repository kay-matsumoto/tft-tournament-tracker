// Authentication Controller - TFT Tournament Tracker
// Handles user authentication, JWT tokens, sessions, and security

import { corsHeaders } from '../middleware/cors.js';
import { validateEmail, validatePassword, sanitize } from '../utils/validation.js';

// Simple implementations for crypto functions (replace with proper libraries in production)
const hashPassword = async (password) => {
    // In production, use bcrypt or similar
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'salt-key-change-in-production');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

const verifyPassword = async (password, hash) => {
    const providedHash = await hashPassword(password);
    return providedHash === hash;
};

const generateJWT = async (payload, secret) => {
    // Simplified JWT generation (use proper JWT library in production)
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payloadStr = btoa(JSON.stringify(payload));
    
    const encoder = new TextEncoder();
    const data = encoder.encode(`${header}.${payloadStr}`);
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, data);
    const signatureStr = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    
    return `${header}.${payloadStr}.${signatureStr}`;
};

const verifyJWT = async (token, secret) => {
    try {
        const [header, payload, signature] = token.split('.');
        
        const encoder = new TextEncoder();
        const data = encoder.encode(`${header}.${payload}`);
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );
        
        // Convert signature back from base64url
        const signatureBytes = Uint8Array.from(
            atob(signature.replace(/-/g, '+').replace(/_/g, '/')),
            c => c.charCodeAt(0)
        );
        
        const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, data);
        
        if (isValid) {
            return JSON.parse(atob(payload));
        }
        return null;
    } catch (error) {
        return null;
    }
};

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

export const login = async (request, env) => {
    try {
        const data = await request.json();
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

        // Validate required fields
        if (!data.username || !data.password) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Username and password are required'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Basic input validation
        if (data.username.length < 3 || data.password.length < 6) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Invalid username or password format'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Find user by username or email
        const user = await env.DB.prepare(`
            SELECT * FROM users 
            WHERE (username = ? OR email = ?) AND is_active = 1
        `).bind(data.username, data.username).first();

        if (!user) {
            // Add small delay to prevent timing attacks
            await new Promise(resolve => setTimeout(resolve, 100));
            return new Response(JSON.stringify({
                success: false,
                error: 'Invalid username or password'
            }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Verify password
        const isValidPassword = await verifyPassword(data.password, user.password_hash);
        if (!isValidPassword) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Invalid username or password'
            }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Generate JWT token
        const jwtSecret = env.JWT_SECRET || 'default-secret-change-in-production';
        const tokenPayload = {
            user_id: user.id,
            username: user.username,
            role: user.role,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (4 * 60 * 60) // 4 hours
        };

        const token = await generateJWT(tokenPayload, jwtSecret);

        // Generate session ID
        const sessionId = crypto.randomUUID();

        // Store session in KV (if available)
        if (env.SESSIONS) {
            const sessionData = {
                user_id: user.id,
                username: user.username,
                role: user.role,
                created_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
                ip_address: clientIP,
                user_agent: request.headers.get('User-Agent') || 'unknown'
            };

            await env.SESSIONS.put(
                `session:${sessionId}`,
                JSON.stringify(sessionData),
                { expirationTtl: 4 * 60 * 60 } // 4 hours
            );
        }

        // Update user's last login
        await env.DB.prepare(`
            UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(user.id).run();

        // Prepare user data for response (excluding password)
        const userData = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            created_at: user.created_at,
            last_login: user.last_login
        };

        return new Response(JSON.stringify({
            success: true,
            data: {
                user: userData,
                token,
                session_id: sessionId,
                expires_at: tokenPayload.exp
            },
            message: 'Login successful'
        }), {
            headers: { 
                ...corsHeaders, 
                'Content-Type': 'application/json',
                'Set-Cookie': `session_id=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=14400`
            }
        });
    } catch (error) {
        console.error('Error during login:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Login failed'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const logout = async (request, env) => {
    try {
        const sessionId = request.headers.get('X-Session-ID') || 
                         getCookieValue(request.headers.get('Cookie'), 'session_id');

        // Remove session from KV
        if (env.SESSIONS && sessionId) {
            await env.SESSIONS.delete(`session:${sessionId}`);
        }

        return new Response(JSON.stringify({
            success: true,
            message: 'Logout successful'
        }), {
            headers: { 
                ...corsHeaders, 
                'Content-Type': 'application/json',
                'Set-Cookie': 'session_id=; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
            }
        });
    } catch (error) {
        console.error('Error during logout:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Logout failed'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const getCurrentUser = async (request, env) => {
    try {
        // User should be attached by authentication middleware
        const user = request.user;

        if (!user) {
            return new Response(JSON.stringify({
                success: false,
                error: 'User not authenticated'
            }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Get fresh user data from database
        const currentUser = await env.DB.prepare(`
            SELECT id, username, email, role, created_at, last_login
            FROM users 
            WHERE id = ? AND is_active = 1
        `).bind(user.id).first();

        if (!currentUser) {
            return new Response(JSON.stringify({
                success: false,
                error: 'User not found or inactive'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            success: true,
            data: currentUser
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error getting current user:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to get user information'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const refreshToken = async (request, env) => {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({
                success: false,
                error: 'No token provided'
            }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const token = authHeader.substring(7);
        const jwtSecret = env.JWT_SECRET || 'default-secret-change-in-production';
        
        // Verify existing token (even if expired, for refresh)
        const payload = await verifyJWT(token, jwtSecret);
        if (!payload) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Invalid token'
            }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Check if user still exists and is active
        const user = await env.DB.prepare(`
            SELECT * FROM users WHERE id = ? AND is_active = 1
        `).bind(payload.user_id).first();

        if (!user) {
            return new Response(JSON.stringify({
                success: false,
                error: 'User not found or inactive'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Generate new token
        const newTokenPayload = {
            user_id: user.id,
            username: user.username,
            role: user.role,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (4 * 60 * 60) // 4 hours
        };

        const newToken = await generateJWT(newTokenPayload, jwtSecret);

        return new Response(JSON.stringify({
            success: true,
            data: {
                token: newToken,
                expires_at: newTokenPayload.exp
            },
            message: 'Token refreshed successfully'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error refreshing token:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to refresh token'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

// ============================================================================
// USER MANAGEMENT (Admin only)
// ============================================================================

export const createUser = async (request, env) => {
    try {
        const data = await request.json();
        const currentUser = request.user;

        // Validate admin permissions
        if (currentUser.role !== 'admin') {
            return new Response(JSON.stringify({
                success: false,
                error: 'Insufficient permissions'
            }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Validate required fields
        if (!data.username || !data.email || !data.password) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Username, email, and password are required'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Validate email format
        if (!validateEmail(data.email)) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Invalid email format'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Validate password strength
        if (!validatePassword(data.password)) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Check for existing user
        const existingUser = await env.DB.prepare(`
            SELECT id FROM users WHERE username = ? OR email = ?
        `).bind(data.username, data.email).first();

        if (existingUser) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Username or email already exists'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Hash password
        const passwordHash = await hashPassword(data.password);

        // Validate role
        const validRoles = ['admin', 'moderator', 'viewer'];
        const role = validRoles.includes(data.role) ? data.role : 'viewer';

        // Create user
        const result = await env.DB.prepare(`
            INSERT INTO users (username, email, password_hash, role)
            VALUES (?, ?, ?, ?)
        `).bind(
            sanitize.username(data.username),
            sanitize.string(data.email),
            passwordHash,
            role
        ).run();

        // Get created user (without password)
        const newUser = await env.DB.prepare(`
            SELECT id, username, email, role, created_at, is_active
            FROM users WHERE id = ?
        `).bind(result.meta.last_row_id).first();

        return new Response(JSON.stringify({
            success: true,
            data: newUser,
            message: 'User created successfully'
        }), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error creating user:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to create user'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const changePassword = async (request, env) => {
    try {
        const data = await request.json();
        const currentUser = request.user;

        // Validate required fields
        if (!data.current_password || !data.new_password) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Current password and new password are required'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Get user's current password hash
        const user = await env.DB.prepare(`
            SELECT password_hash FROM users WHERE id = ?
        `).bind(currentUser.id).first();

        if (!user) {
            return new Response(JSON.stringify({
                success: false,
                error: 'User not found'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Verify current password
        const isValidPassword = await verifyPassword(data.current_password, user.password_hash);
        if (!isValidPassword) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Current password is incorrect'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Validate new password
        if (!validatePassword(data.new_password)) {
            return new Response(JSON.stringify({
                success: false,
                error: 'New password must be at least 8 characters and contain uppercase, lowercase, number, and special character'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Hash new password
        const newPasswordHash = await hashPassword(data.new_password);

        // Update password
        await env.DB.prepare(`
            UPDATE users SET password_hash = ? WHERE id = ?
        `).bind(newPasswordHash, currentUser.id).run();

        return new Response(JSON.stringify({
            success: true,
            message: 'Password changed successfully'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error changing password:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to change password'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

// ============================================================================
// MIDDLEWARE FUNCTIONS
// ============================================================================

export const authenticate = async (request, env) => {
    try {
        // Try JWT from Authorization header first
        const authHeader = request.headers.get('Authorization');
        let user = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const jwtSecret = env.JWT_SECRET || 'default-secret-change-in-production';
            const payload = await verifyJWT(token, jwtSecret);
            
            if (payload && payload.exp > Math.floor(Date.now() / 1000)) {
                user = {
                    id: payload.user_id,
                    username: payload.username,
                    role: payload.role
                };
            }
        }

        // Fallback to session from KV
        if (!user && env.SESSIONS) {
            const sessionId = request.headers.get('X-Session-ID') || 
                             getCookieValue(request.headers.get('Cookie'), 'session_id');

            if (sessionId) {
                const sessionData = await env.SESSIONS.get(`session:${sessionId}`);
                if (sessionData) {
                    const session = JSON.parse(sessionData);
                    if (new Date(session.expires_at) > new Date()) {
                        user = {
                            id: session.user_id,
                            username: session.username,
                            role: session.role
                        };
                    }
                }
            }
        }

        if (user) {
            request.user = user;
            return { authenticated: true, user };
        }

        return { authenticated: false, user: null };
    } catch (error) {
        console.error('Authentication error:', error);
        return { authenticated: false, user: null };
    }
};

export const requireRole = (requiredRole) => {
    return (request, env) => {
        const user = request.user;
        
        if (!user) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Authentication required'
            }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const roleHierarchy = { viewer: 1, moderator: 2, admin: 3 };
        const userLevel = roleHierarchy[user.role] || 0;
        const requiredLevel = roleHierarchy[requiredRole] || 999;

        if (userLevel < requiredLevel) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Insufficient permissions'
            }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        return null; // Allow request to continue
    };
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const getCookieValue = (cookieHeader, name) => {
    if (!cookieHeader) return null;
    
    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
        const [cookieName, cookieValue] = cookie.trim().split('=');
        if (cookieName === name) {
            return cookieValue;
        }
    }
    return null;
};

// Export middleware functions for use in routes
export { authenticate as authenticateMiddleware, requireRole as requireRoleMiddleware };