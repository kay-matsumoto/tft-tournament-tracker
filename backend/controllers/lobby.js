// Lobby Controller - TFT Tournament Tracker
// Handles lobby creation, player assignments, and streaming links for co-streamers

import { corsHeaders } from '../middleware/cors.js';
import { validateUrl, sanitize } from '../utils/validation.js';

// ============================================================================
// LOBBY MANAGEMENT
// ============================================================================

export const createLobbies = async (request, env) => {
    try {
        const data = await request.json();
        const userId = request.user.id;

        // Validate required fields
        if (!data.tournament_id || !data.day_number || !data.game_number) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing required fields: tournament_id, day_number, game_number'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Validate tournament exists and is not completed
        const tournament = await env.DB.prepare(`
            SELECT * FROM tournaments 
            WHERE id = ? AND status != 'completed'
        `).bind(data.tournament_id).first();

        if (!tournament) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Tournament not found or already completed'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Check if lobbies already exist for this game
        const existingLobbies = await env.DB.prepare(`
            SELECT COUNT(*) as count FROM lobbies 
            WHERE tournament_id = ? AND day_number = ? AND game_number = ?
        `).bind(data.tournament_id, data.day_number, data.game_number).first();

        if (existingLobbies.count > 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Lobbies already exist for this game'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Get tournament participants
        const participants = await env.DB.prepare(`
            SELECT tp.player_id, p.display_name, p.region
            FROM tournament_participants tp
            JOIN players p ON tp.player_id = p.id
            WHERE tp.tournament_id = ?
            ORDER BY p.display_name
        `).bind(data.tournament_id).all();

        if (participants.results.length === 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'No participants found for this tournament'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Calculate number of lobbies needed (8 players per lobby)
        const playerCount = participants.results.length;
        const lobbyCount = Math.ceil(playerCount / 8);

        // Validate lobby count doesn't exceed tournament limits
        if (lobbyCount > tournament.max_lobbies) {
            return new Response(JSON.stringify({
                success: false,
                error: `Would require ${lobbyCount} lobbies, but tournament limit is ${tournament.max_lobbies}`
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Create lobbies and assign players
        const createdLobbies = [];
        const lobbyStatements = [];
        const participantStatements = [];

        for (let lobbyNum = 1; lobbyNum <= lobbyCount; lobbyNum++) {
            // Create lobby
            const lobbyResult = await env.DB.prepare(`
                INSERT INTO lobbies (tournament_id, lobby_number, day_number, game_number, status)
                VALUES (?, ?, ?, ?, 'pending')
            `).bind(data.tournament_id, lobbyNum, data.day_number, data.game_number).run();

            const lobbyId = lobbyResult.meta.last_row_id;

            // Assign players to this lobby (8 players max)
            const startIndex = (lobbyNum - 1) * 8;
            const endIndex = Math.min(startIndex + 8, playerCount);
            const lobbyPlayers = participants.results.slice(startIndex, endIndex);

            // Create lobby participant entries
            for (const player of lobbyPlayers) {
                participantStatements.push(
                    env.DB.prepare(`
                        INSERT INTO lobby_participants (lobby_id, player_id)
                        VALUES (?, ?)
                    `).bind(lobbyId, player.player_id)
                );
            }

            createdLobbies.push({
                lobby_id: lobbyId,
                lobby_number: lobbyNum,
                player_count: lobbyPlayers.length,
                players: lobbyPlayers
            });
        }

        // Execute participant assignments in batch
        if (participantStatements.length > 0) {
            await env.DB.batch(participantStatements);
        }

        return new Response(JSON.stringify({
            success: true,
            data: {
                tournament_id: data.tournament_id,
                day_number: data.day_number,
                game_number: data.game_number,
                lobbies_created: lobbyCount,
                total_players: playerCount,
                lobbies: createdLobbies
            },
            message: `Successfully created ${lobbyCount} lobbies for ${playerCount} players`
        }), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error creating lobbies:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to create lobbies'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const getLobbiesForGame = async (request, env) => {
    try {
        const url = new URL(request.url);
        const tournamentId = url.pathname.split('/')[3];
        const dayNumber = url.pathname.split('/')[5];
        const gameNumber = url.pathname.split('/')[6];

        // Get lobbies with participants and streaming links
        const lobbies = await env.DB.prepare(`
            SELECT 
                l.*,
                COUNT(lp.player_id) as player_count
            FROM lobbies l
            LEFT JOIN lobby_participants lp ON l.id = lp.lobby_id
            WHERE l.tournament_id = ? AND l.day_number = ? AND l.game_number = ?
            GROUP BY l.id
            ORDER BY l.lobby_number
        `).bind(tournamentId, dayNumber, gameNumber).all();

        // Get participants for each lobby
        const lobbiesWithDetails = [];
        for (const lobby of lobbies.results) {
            // Get participants
            const participants = await env.DB.prepare(`
                SELECT 
                    lp.*,
                    p.username,
                    p.display_name,
                    p.region,
                    p.twitch_username
                FROM lobby_participants lp
                JOIN players p ON lp.player_id = p.id
                WHERE lp.lobby_id = ?
                ORDER BY p.display_name
            `).bind(lobby.id).all();

            // Get streaming links
            const streams = await env.DB.prepare(`
                SELECT * FROM lobby_streams
                WHERE lobby_id = ?
                ORDER BY is_primary DESC, streamer_name
            `).bind(lobby.id).all();

            lobbiesWithDetails.push({
                ...lobby,
                participants: participants.results,
                streams: streams.results
            });
        }

        return new Response(JSON.stringify({
            success: true,
            data: {
                tournament_id: parseInt(tournamentId),
                day_number: parseInt(dayNumber),
                game_number: parseInt(gameNumber),
                lobby_count: lobbies.results.length,
                lobbies: lobbiesWithDetails
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching lobbies:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to fetch lobbies'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const updateLobbyParticipants = async (request, env) => {
    try {
        const url = new URL(request.url);
        const lobbyId = url.pathname.split('/')[3];
        const data = await request.json();

        // Validate lobby exists
        const lobby = await env.DB.prepare(`
            SELECT l.*, t.status as tournament_status
            FROM lobbies l
            JOIN tournaments t ON l.tournament_id = t.id
            WHERE l.id = ?
        `).bind(lobbyId).first();

        if (!lobby) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Lobby not found'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Prevent modification if tournament is completed or lobby is completed
        if (lobby.tournament_status === 'completed' || lobby.status === 'completed') {
            return new Response(JSON.stringify({
                success: false,
                error: 'Cannot modify participants of completed lobby or tournament'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Validate player_ids array
        if (!Array.isArray(data.player_ids) || data.player_ids.length === 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'player_ids array is required and must not be empty'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (data.player_ids.length > 8) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Maximum 8 players per lobby'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Verify all players are tournament participants
        const validPlayers = await env.DB.prepare(`
            SELECT tp.player_id, p.display_name
            FROM tournament_participants tp
            JOIN players p ON tp.player_id = p.id
            WHERE tp.tournament_id = ? AND tp.player_id IN (${data.player_ids.map(() => '?').join(',')})
        `).bind(lobby.tournament_id, ...data.player_ids).all();

        if (validPlayers.results.length !== data.player_ids.length) {
            return new Response(JSON.stringify({
                success: false,
                error: 'One or more players are not registered for this tournament'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Remove existing participants
        await env.DB.prepare(`
            DELETE FROM lobby_participants WHERE lobby_id = ?
        `).bind(lobbyId).run();

        // Add new participants
        const insertStatements = data.player_ids.map(playerId =>
            env.DB.prepare(`
                INSERT INTO lobby_participants (lobby_id, player_id)
                VALUES (?, ?)
            `).bind(lobbyId, playerId)
        );

        await env.DB.batch(insertStatements);

        // Get updated lobby with participants
        const updatedParticipants = await env.DB.prepare(`
            SELECT 
                lp.*,
                p.username,
                p.display_name,
                p.region
            FROM lobby_participants lp
            JOIN players p ON lp.player_id = p.id
            WHERE lp.lobby_id = ?
            ORDER BY p.display_name
        `).bind(lobbyId).all();

        return new Response(JSON.stringify({
            success: true,
            data: {
                lobby_id: parseInt(lobbyId),
                participant_count: updatedParticipants.results.length,
                participants: updatedParticipants.results
            },
            message: 'Lobby participants updated successfully'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error updating lobby participants:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to update lobby participants'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const startLobby = async (request, env) => {
    try {
        const url = new URL(request.url);
        const lobbyId = url.pathname.split('/')[3];

        // Validate lobby exists and can be started
        const lobby = await env.DB.prepare(`
            SELECT l.*, t.status as tournament_status
            FROM lobbies l
            JOIN tournaments t ON l.tournament_id = t.id
            WHERE l.id = ?
        `).bind(lobbyId).first();

        if (!lobby) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Lobby not found'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (lobby.status === 'active') {
            return new Response(JSON.stringify({
                success: false,
                error: 'Lobby is already active'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (lobby.status === 'completed') {
            return new Response(JSON.stringify({
                success: false,
                error: 'Lobby is already completed'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Check if lobby has participants
        const participantCount = await env.DB.prepare(`
            SELECT COUNT(*) as count FROM lobby_participants WHERE lobby_id = ?
        `).bind(lobbyId).first();

        if (participantCount.count === 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Cannot start lobby with no participants'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Start the lobby
        await env.DB.prepare(`
            UPDATE lobbies 
            SET status = 'active', started_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).bind(lobbyId).run();

        return new Response(JSON.stringify({
            success: true,
            message: 'Lobby started successfully'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error starting lobby:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to start lobby'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const completeLobby = async (request, env) => {
    try {
        const url = new URL(request.url);
        const lobbyId = url.pathname.split('/')[3];

        // Validate lobby exists
        const lobby = await env.DB.prepare(`
            SELECT * FROM lobbies WHERE id = ?
        `).bind(lobbyId).first();

        if (!lobby) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Lobby not found'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (lobby.status === 'completed') {
            return new Response(JSON.stringify({
                success: false,
                error: 'Lobby is already completed'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Complete the lobby
        await env.DB.prepare(`
            UPDATE lobbies 
            SET status = 'completed', completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).bind(lobbyId).run();

        return new Response(JSON.stringify({
            success: true,
            message: 'Lobby completed successfully'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error completing lobby:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to complete lobby'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

// ============================================================================
// STREAMING LINKS MANAGEMENT
// ============================================================================

export const addStreamLink = async (request, env) => {
    try {
        const url = new URL(request.url);
        const lobbyId = url.pathname.split('/')[3];
        const data = await request.json();

        // Validate required fields
        if (!data.streamer_name || !data.stream_url) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing required fields: streamer_name, stream_url'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Validate lobby exists
        const lobby = await env.DB.prepare(`
            SELECT * FROM lobbies WHERE id = ?
        `).bind(lobbyId).first();

        if (!lobby) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Lobby not found'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Validate URL format
        if (!validateUrl(data.stream_url)) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Invalid stream URL format'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Determine platform from URL
        let platform = 'other';
        const lowerUrl = data.stream_url.toLowerCase();
        if (lowerUrl.includes('twitch.tv')) {
            platform = 'twitch';
        } else if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
            platform = 'youtube';
        }

        // Check if this is set as primary and update existing primary streams
        if (data.is_primary) {
            await env.DB.prepare(`
                UPDATE lobby_streams 
                SET is_primary = 0 
                WHERE lobby_id = ?
            `).bind(lobbyId).run();
        }

        // Create stream link
        const result = await env.DB.prepare(`
            INSERT INTO lobby_streams (
                lobby_id, streamer_name, platform, stream_url, is_primary
            ) VALUES (?, ?, ?, ?, ?)
        `).bind(
            lobbyId,
            sanitize.string(data.streamer_name),
            platform,
            data.stream_url,
            data.is_primary ? 1 : 0
        ).run();

        // Get the created stream link
        const newStream = await env.DB.prepare(`
            SELECT * FROM lobby_streams WHERE id = ?
        `).bind(result.meta.last_row_id).first();

        return new Response(JSON.stringify({
            success: true,
            data: newStream,
            message: 'Stream link added successfully'
        }), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error adding stream link:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to add stream link'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const updateStreamLink = async (request, env) => {
    try {
        const url = new URL(request.url);
        const lobbyId = url.pathname.split('/')[3];
        const streamId = url.pathname.split('/')[5];
        const data = await request.json();

        // Validate stream exists and belongs to lobby
        const existingStream = await env.DB.prepare(`
            SELECT * FROM lobby_streams 
            WHERE id = ? AND lobby_id = ?
        `).bind(streamId, lobbyId).first();

        if (!existingStream) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Stream link not found'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Build update query
        const updates = [];
        const params = [];

        if (data.streamer_name !== undefined) {
            updates.push('streamer_name = ?');
            params.push(sanitize.string(data.streamer_name));
        }

        if (data.stream_url !== undefined) {
            if (!validateUrl(data.stream_url)) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Invalid stream URL format'
                }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            updates.push('stream_url = ?');
            params.push(data.stream_url);

            // Update platform based on new URL
            let platform = 'other';
            const lowerUrl = data.stream_url.toLowerCase();
            if (lowerUrl.includes('twitch.tv')) {
                platform = 'twitch';
            } else if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
                platform = 'youtube';
            }
            updates.push('platform = ?');
            params.push(platform);
        }

        if (data.is_primary !== undefined) {
            if (data.is_primary) {
                // Remove primary flag from other streams in this lobby
                await env.DB.prepare(`
                    UPDATE lobby_streams 
                    SET is_primary = 0 
                    WHERE lobby_id = ? AND id != ?
                `).bind(lobbyId, streamId).run();
            }
            updates.push('is_primary = ?');
            params.push(data.is_primary ? 1 : 0);
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

        params.push(streamId);

        await env.DB.prepare(`
            UPDATE lobby_streams 
            SET ${updates.join(', ')}
            WHERE id = ?
        `).bind(...params).run();

        // Get updated stream
        const updatedStream = await env.DB.prepare(`
            SELECT * FROM lobby_streams WHERE id = ?
        `).bind(streamId).first();

        return new Response(JSON.stringify({
            success: true,
            data: updatedStream,
            message: 'Stream link updated successfully'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error updating stream link:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to update stream link'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const deleteStreamLink = async (request, env) => {
    try {
        const url = new URL(request.url);
        const lobbyId = url.pathname.split('/')[3];
        const streamId = url.pathname.split('/')[5];

        // Validate stream exists and belongs to lobby
        const existingStream = await env.DB.prepare(`
            SELECT * FROM lobby_streams 
            WHERE id = ? AND lobby_id = ?
        `).bind(streamId, lobbyId).first();

        if (!existingStream) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Stream link not found'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Delete the stream link
        await env.DB.prepare(`
            DELETE FROM lobby_streams WHERE id = ?
        `).bind(streamId).run();

        return new Response(JSON.stringify({
            success: true,
            message: 'Stream link deleted successfully'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error deleting stream link:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to delete stream link'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

// ============================================================================
// LOBBY UTILITIES
// ============================================================================

export const generateRandomLobbies = async (request, env) => {
    try {
        const url = new URL(request.url);
        const tournamentId = url.pathname.split('/')[3];
        const data = await request.json();

        // Validate required fields
        if (!data.day_number || !data.game_number) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing required fields: day_number, game_number'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Get tournament participants
        const participants = await env.DB.prepare(`
            SELECT tp.player_id, p.display_name, p.region
            FROM tournament_participants tp
            JOIN players p ON tp.player_id = p.id
            WHERE tp.tournament_id = ?
            ORDER BY RANDOM()
        `).bind(tournamentId).all();

        if (participants.results.length === 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'No participants found for this tournament'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Use the existing createLobbies logic with randomized player order
        const mockRequest = {
            json: async () => ({
                tournament_id: parseInt(tournamentId),
                day_number: data.day_number,
                game_number: data.game_number
            }),
            user: request.user
        };

        return await createLobbies(mockRequest, env);
    } catch (error) {
        console.error('Error generating random lobbies:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to generate random lobbies'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const getLobbyStatistics = async (request, env) => {
    try {
        const url = new URL(request.url);
        const tournamentId = url.searchParams.get('tournament_id');

        let query = `
            SELECT 
                l.tournament_id,
                l.day_number,
                l.game_number,
                COUNT(DISTINCT l.id) as total_lobbies,
                COUNT(DISTINCT lp.player_id) as total_participants,
                COUNT(DISTINCT ls.id) as total_streams,
                SUM(CASE WHEN l.status = 'completed' THEN 1 ELSE 0 END) as completed_lobbies,
                SUM(CASE WHEN l.status = 'active' THEN 1 ELSE 0 END) as active_lobbies,
                SUM(CASE WHEN l.status = 'pending' THEN 1 ELSE 0 END) as pending_lobbies
            FROM lobbies l
            LEFT JOIN lobby_participants lp ON l.id = lp.lobby_id
            LEFT JOIN lobby_streams ls ON l.id = ls.lobby_id
            WHERE 1=1
        `;

        const params = [];

        if (tournamentId) {
            query += ` AND l.tournament_id = ?`;
            params.push(tournamentId);
        }

        query += `
            GROUP BY l.tournament_id, l.day_number, l.game_number
            ORDER BY l.tournament_id, l.day_number, l.game_number
        `;

        const statistics = await env.DB.prepare(query).bind(...params).all();

        return new Response(JSON.stringify({
            success: true,
            data: statistics.results
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching lobby statistics:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to fetch lobby statistics'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};