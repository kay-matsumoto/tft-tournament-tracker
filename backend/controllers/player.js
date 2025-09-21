// Player Management Controller - TFT Tournament Tracker
// Handles all player CRUD operations, validation, and tournament history

import { corsHeaders } from '../middleware/cors.js';
import { validatePlayerData, sanitize } from '../utils/validation.js';

// ============================================================================
// PUBLIC PLAYER ENDPOINTS
// ============================================================================

export const getAllPlayers = async (request, env) => {
    try {
        const url = new URL(request.url);
        const region = url.searchParams.get('region');
        const isActive = url.searchParams.get('active');
        const page = parseInt(url.searchParams.get('page')) || 1;
        const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 100);
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                p.*,
                COUNT(DISTINCT tp.tournament_id) as tournaments_played,
                COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN tp.tournament_id END) as tournaments_completed,
                AVG(ts.total_points) as avg_points,
                SUM(ts.first_places) as total_first_places,
                SUM(ts.top_four_count) as total_top_fours
            FROM players p
            LEFT JOIN tournament_participants tp ON p.id = tp.player_id
            LEFT JOIN tournaments t ON tp.tournament_id = t.id
            LEFT JOIN tournament_stats ts ON p.id = ts.player_id AND t.id = ts.tournament_id
            WHERE 1=1
        `;

        const params = [];

        // Add filters
        if (region) {
            query += ` AND p.region = ?`;
            params.push(region);
        }

        if (isActive !== null && isActive !== undefined) {
            query += ` AND p.is_active = ?`;
            params.push(isActive === 'true' ? 1 : 0);
        }

        query += `
            GROUP BY p.id
            ORDER BY p.display_name ASC
            LIMIT ? OFFSET ?
        `;
        params.push(limit, offset);

        const players = await env.DB.prepare(query).bind(...params).all();

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM players WHERE 1=1';
        const countParams = [];

        if (region) {
            countQuery += ' AND region = ?';
            countParams.push(region);
        }

        if (isActive !== null && isActive !== undefined) {
            countQuery += ' AND is_active = ?';
            countParams.push(isActive === 'true' ? 1 : 0);
        }

        const totalCount = await env.DB.prepare(countQuery).bind(...countParams).first();

        return new Response(JSON.stringify({
            success: true,
            data: players.results,
            pagination: {
                page,
                limit,
                total: totalCount.total,
                pages: Math.ceil(totalCount.total / limit)
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching players:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to fetch players'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const getPlayerById = async (request, env) => {
    try {
        const url = new URL(request.url);
        const playerId = url.pathname.split('/')[3];

        // Get player basic info with tournament stats
        const player = await env.DB.prepare(`
            SELECT 
                p.*,
                COUNT(DISTINCT tp.tournament_id) as tournaments_played,
                COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN tp.tournament_id END) as tournaments_completed,
                AVG(ts.total_points) as avg_points,
                SUM(ts.first_places) as total_first_places,
                SUM(ts.second_places) as total_second_places,
                SUM(ts.third_places) as total_third_places,
                SUM(ts.fourth_places) as total_fourth_places,
                SUM(ts.top_four_count) as total_top_fours,
                MIN(ts.current_rank) as best_tournament_rank,
                MAX(ts.total_points) as highest_tournament_score
            FROM players p
            LEFT JOIN tournament_participants tp ON p.id = tp.player_id
            LEFT JOIN tournaments t ON tp.tournament_id = t.id
            LEFT JOIN tournament_stats ts ON p.id = ts.player_id AND t.id = ts.tournament_id
            WHERE p.id = ?
            GROUP BY p.id
        `).bind(playerId).first();

        if (!player) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Player not found'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            success: true,
            data: player
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching player:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to fetch player'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const getPlayerTournamentHistory = async (request, env) => {
    try {
        const url = new URL(request.url);
        const playerId = url.pathname.split('/')[3];
        const page = parseInt(url.searchParams.get('page')) || 1;
        const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 50);
        const offset = (page - 1) * limit;

        // Get tournament history with placement and stats
        const tournaments = await env.DB.prepare(`
            SELECT 
                t.id,
                t.name,
                t.league_type,
                t.tournament_format,
                t.start_date,
                t.end_date,
                t.status,
                ts.total_points,
                ts.games_played,
                ts.current_rank,
                ts.first_places,
                ts.second_places,
                ts.third_places,
                ts.fourth_places,
                ts.top_four_count,
                tp.registered_at
            FROM tournament_participants tp
            JOIN tournaments t ON tp.tournament_id = t.id
            LEFT JOIN tournament_stats ts ON tp.tournament_id = ts.tournament_id AND tp.player_id = ts.player_id
            WHERE tp.player_id = ?
            ORDER BY t.start_date DESC
            LIMIT ? OFFSET ?
        `).bind(playerId, limit, offset).all();

        // Get total tournament count
        const totalCount = await env.DB.prepare(`
            SELECT COUNT(*) as total 
            FROM tournament_participants 
            WHERE player_id = ?
        `).bind(playerId).first();

        return new Response(JSON.stringify({
            success: true,
            data: tournaments.results,
            pagination: {
                page,
                limit,
                total: totalCount.total,
                pages: Math.ceil(totalCount.total / limit)
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching player tournament history:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to fetch tournament history'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const searchPlayers = async (request, env) => {
    try {
        const url = new URL(request.url);
        const query = url.searchParams.get('q');
        const region = url.searchParams.get('region');
        const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 50);

        if (!query || query.length < 2) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Search query must be at least 2 characters'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        let searchQuery = `
            SELECT 
                p.*,
                COUNT(DISTINCT tp.tournament_id) as tournaments_played,
                SUM(ts.first_places) as total_first_places
            FROM players p
            LEFT JOIN tournament_participants tp ON p.id = tp.player_id
            LEFT JOIN tournament_stats ts ON p.id = ts.player_id
            WHERE (p.username LIKE ? OR p.display_name LIKE ?)
            AND p.is_active = 1
        `;

        const params = [`%${query}%`, `%${query}%`];

        if (region) {
            searchQuery += ` AND p.region = ?`;
            params.push(region);
        }

        searchQuery += `
            GROUP BY p.id
            ORDER BY tournaments_played DESC, total_first_places DESC
            LIMIT ?
        `;
        params.push(limit);

        const players = await env.DB.prepare(searchQuery).bind(...params).all();

        return new Response(JSON.stringify({
            success: true,
            data: players.results
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error searching players:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to search players'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

// ============================================================================
// ADMIN PLAYER MANAGEMENT
// ============================================================================

export const createPlayer = async (request, env) => {
    try {
        const data = await request.json();

        // Validate required fields
        const validation = validatePlayerData(data);
        if (!validation.valid) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Validation failed',
                details: validation.errors
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Sanitize input data
        const playerData = {
            username: sanitize.username(data.username),
            display_name: sanitize.string(data.display_name),
            region: data.region,
            country: data.country ? sanitize.string(data.country) : null,
            twitch_username: data.twitch_username ? sanitize.username(data.twitch_username) : null,
            discord_tag: data.discord_tag ? sanitize.string(data.discord_tag) : null,
            riot_puuid: data.riot_puuid ? sanitize.string(data.riot_puuid) : null
        };

        // Check for duplicate username
        const existingPlayer = await env.DB.prepare(`
            SELECT id FROM players WHERE username = ? OR display_name = ?
        `).bind(playerData.username, playerData.display_name).first();

        if (existingPlayer) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Player with this username or display name already exists'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Create player
        const result = await env.DB.prepare(`
            INSERT INTO players (
                username, display_name, region, country, 
                twitch_username, discord_tag, riot_puuid
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            playerData.username,
            playerData.display_name,
            playerData.region,
            playerData.country,
            playerData.twitch_username,
            playerData.discord_tag,
            playerData.riot_puuid
        ).run();

        // Get the created player
        const newPlayer = await env.DB.prepare(`
            SELECT * FROM players WHERE id = ?
        `).bind(result.meta.last_row_id).first();

        return new Response(JSON.stringify({
            success: true,
            data: newPlayer,
            message: 'Player created successfully'
        }), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error creating player:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to create player'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const updatePlayer = async (request, env) => {
    try {
        const url = new URL(request.url);
        const playerId = url.pathname.split('/')[4];
        const data = await request.json();

        // Check if player exists
        const existingPlayer = await env.DB.prepare(`
            SELECT * FROM players WHERE id = ?
        `).bind(playerId).first();

        if (!existingPlayer) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Player not found'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Build update query dynamically
        const updates = [];
        const params = [];

        if (data.username !== undefined) {
            // Check for duplicate username
            const duplicate = await env.DB.prepare(`
                SELECT id FROM players WHERE username = ? AND id != ?
            `).bind(data.username, playerId).first();

            if (duplicate) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Username already taken'
                }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            updates.push('username = ?');
            params.push(sanitize.username(data.username));
        }

        if (data.display_name !== undefined) {
            updates.push('display_name = ?');
            params.push(sanitize.string(data.display_name));
        }

        if (data.region !== undefined) {
            updates.push('region = ?');
            params.push(data.region);
        }

        if (data.country !== undefined) {
            updates.push('country = ?');
            params.push(data.country ? sanitize.string(data.country) : null);
        }

        if (data.twitch_username !== undefined) {
            updates.push('twitch_username = ?');
            params.push(data.twitch_username ? sanitize.username(data.twitch_username) : null);
        }

        if (data.discord_tag !== undefined) {
            updates.push('discord_tag = ?');
            params.push(data.discord_tag ? sanitize.string(data.discord_tag) : null);
        }

        if (data.riot_puuid !== undefined) {
            updates.push('riot_puuid = ?');
            params.push(data.riot_puuid ? sanitize.string(data.riot_puuid) : null);
        }

        if (data.is_active !== undefined) {
            updates.push('is_active = ?');
            params.push(data.is_active ? 1 : 0);
        }

        if (updates.length === 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'No valid fields to update'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        params.push(playerId);

        await env.DB.prepare(`
            UPDATE players 
            SET ${updates.join(', ')}
            WHERE id = ?
        `).bind(...params).run();

        // Get updated player
        const updatedPlayer = await env.DB.prepare(`
            SELECT * FROM players WHERE id = ?
        `).bind(playerId).first();

        return new Response(JSON.stringify({
            success: true,
            data: updatedPlayer,
            message: 'Player updated successfully'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error updating player:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to update player'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const deletePlayer = async (request, env) => {
    try {
        const url = new URL(request.url);
        const playerId = url.pathname.split('/')[4];

        // Check if player exists
        const player = await env.DB.prepare(`
            SELECT * FROM players WHERE id = ?
        `).bind(playerId).first();

        if (!player) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Player not found'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Check if player has tournament participation
        const participations = await env.DB.prepare(`
            SELECT COUNT(*) as count FROM tournament_participants WHERE player_id = ?
        `).bind(playerId).first();

        if (participations.count > 0) {
            // Soft delete - deactivate instead of actual deletion
            await env.DB.prepare(`
                UPDATE players SET is_active = 0 WHERE id = ?
            `).bind(playerId).run();

            return new Response(JSON.stringify({
                success: true,
                message: 'Player deactivated (has tournament history)',
                action: 'deactivated'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } else {
            // Hard delete - no tournament history
            await env.DB.prepare(`
                DELETE FROM players WHERE id = ?
            `).bind(playerId).run();

            return new Response(JSON.stringify({
                success: true,
                message: 'Player deleted successfully',
                action: 'deleted'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    } catch (error) {
        console.error('Error deleting player:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to delete player'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

// ============================================================================
// BULK OPERATIONS
// ============================================================================

export const bulkCreatePlayers = async (request, env) => {
    try {
        const data = await request.json();
        
        if (!Array.isArray(data.players) || data.players.length === 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Players array is required and must not be empty'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (data.players.length > 100) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Maximum 100 players can be created at once'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const results = {
            created: [],
            errors: [],
            duplicates: []
        };

        // Process each player
        for (let i = 0; i < data.players.length; i++) {
            const playerData = data.players[i];
            
            try {
                // Validate player data
                const validation = validatePlayerData(playerData);
                if (!validation.valid) {
                    results.errors.push({
                        index: i,
                        data: playerData,
                        error: validation.errors
                    });
                    continue;
                }

                // Check for duplicates
                const existingPlayer = await env.DB.prepare(`
                    SELECT id FROM players WHERE username = ? OR display_name = ?
                `).bind(playerData.username, playerData.display_name).first();

                if (existingPlayer) {
                    results.duplicates.push({
                        index: i,
                        data: playerData,
                        existing_id: existingPlayer.id
                    });
                    continue;
                }

                // Create player
                const result = await env.DB.prepare(`
                    INSERT INTO players (
                        username, display_name, region, country,
                        twitch_username, discord_tag, riot_puuid
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    sanitize.username(playerData.username),
                    sanitize.string(playerData.display_name),
                    playerData.region,
                    playerData.country ? sanitize.string(playerData.country) : null,
                    playerData.twitch_username ? sanitize.username(playerData.twitch_username) : null,
                    playerData.discord_tag ? sanitize.string(playerData.discord_tag) : null,
                    playerData.riot_puuid ? sanitize.string(playerData.riot_puuid) : null
                ).run();

                results.created.push({
                    index: i,
                    id: result.meta.last_row_id,
                    username: playerData.username
                });

            } catch (error) {
                results.errors.push({
                    index: i,
                    data: playerData,
                    error: error.message
                });
            }
        }

        return new Response(JSON.stringify({
            success: true,
            data: results,
            summary: {
                total: data.players.length,
                created: results.created.length,
                errors: results.errors.length,
                duplicates: results.duplicates.length
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error bulk creating players:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to bulk create players'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

// ============================================================================
// PLAYER STATISTICS
// ============================================================================

export const getPlayerStatistics = async (request, env) => {
    try {
        const url = new URL(request.url);
        const playerId = url.pathname.split('/')[3];

        // Get comprehensive player statistics
        const stats = await env.DB.prepare(`
            SELECT 
                p.username,
                p.display_name,
                p.region,
                COUNT(DISTINCT tp.tournament_id) as total_tournaments,
                COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN tp.tournament_id END) as completed_tournaments,
                COUNT(DISTINCT CASE WHEN t.league_type = 'pro' THEN tp.tournament_id END) as pro_tournaments,
                COUNT(DISTINCT CASE WHEN t.league_type = 'ladder' THEN tp.tournament_id END) as ladder_tournaments,
                SUM(ts.total_points) as lifetime_points,
                AVG(ts.total_points) as avg_tournament_points,
                SUM(ts.games_played) as total_games,
                AVG(ts.games_played) as avg_games_per_tournament,
                SUM(ts.first_places) as total_first_places,
                SUM(ts.second_places) as total_second_places,
                SUM(ts.third_places) as total_third_places,
                SUM(ts.fourth_places) as total_fourth_places,
                SUM(ts.top_four_count) as total_top_fours,
                ROUND(SUM(ts.top_four_count) * 100.0 / SUM(ts.games_played), 2) as top_four_rate,
                ROUND(SUM(ts.first_places) * 100.0 / SUM(ts.games_played), 2) as win_rate,
                MIN(ts.current_rank) as best_tournament_finish,
                MAX(ts.total_points) as highest_tournament_score,
                AVG(CASE WHEN ts.games_played > 0 THEN ts.total_points * 1.0 / ts.games_played END) as avg_points_per_game
            FROM players p
            LEFT JOIN tournament_participants tp ON p.id = tp.player_id
            LEFT JOIN tournaments t ON tp.tournament_id = t.id
            LEFT JOIN tournament_stats ts ON p.id = ts.player_id AND t.id = ts.tournament_id
            WHERE p.id = ?
            GROUP BY p.id
        `).bind(playerId).first();

        if (!stats) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Player not found'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Get recent tournament performance
        const recentTournaments = await env.DB.prepare(`
            SELECT 
                t.name,
                t.league_type,
                t.start_date,
                ts.total_points,
                ts.current_rank,
                ts.games_played,
                ts.first_places,
                ts.top_four_count
            FROM tournament_participants tp
            JOIN tournaments t ON tp.tournament_id = t.id
            LEFT JOIN tournament_stats ts ON tp.tournament_id = ts.tournament_id AND tp.player_id = ts.player_id
            WHERE tp.player_id = ? AND t.status = 'completed'
            ORDER BY t.start_date DESC
            LIMIT 10
        `).bind(playerId).all();

        return new Response(JSON.stringify({
            success: true,
            data: {
                overview: stats,
                recent_tournaments: recentTournaments.results
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching player statistics:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to fetch player statistics'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};