// Game Results Controller - TFT Tournament Tracker
// Handles game result submission, validation, and statistics updates

import { corsHeaders } from '../middleware/cors.js';
import { updateStatsForGameResult, recalculateStatsInternal } from './statistics.js';
import { validateGameResult, sanitize } from '../utils/validation.js';

// ============================================================================
// GAME RESULT SUBMISSION
// ============================================================================

export const submitGameResults = async (request, env) => {
    try {
        const data = await request.json();
        const userId = request.user.id;

        // Validate the game results data structure
        if (!data.tournament_id || !data.day_number || !data.game_number || !Array.isArray(data.results)) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing required fields: tournament_id, day_number, game_number, results'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Validate tournament exists and is active
        const tournament = await env.DB.prepare(`
            SELECT * FROM tournaments 
            WHERE id = ? AND status IN ('active', 'upcoming')
        `).bind(data.tournament_id).first();

        if (!tournament) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Tournament not found or not active'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Validate game results format
        if (data.results.length !== 8) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Each game must have exactly 8 player results'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Validate each result entry
        const validationErrors = [];
        const playerPlacements = new Set();
        const playerIds = new Set();

        for (let i = 0; i < data.results.length; i++) {
            const result = data.results[i];
            
            // Check required fields
            if (!result.player_id || !result.placement) {
                validationErrors.push(`Result ${i + 1}: Missing player_id or placement`);
                continue;
            }

            // Check placement validity (1-8)
            if (result.placement < 1 || result.placement > 8) {
                validationErrors.push(`Result ${i + 1}: Placement must be between 1 and 8`);
                continue;
            }

            // Check for duplicate placements
            if (playerPlacements.has(result.placement)) {
                validationErrors.push(`Result ${i + 1}: Placement ${result.placement} already assigned`);
                continue;
            }
            playerPlacements.add(result.placement);

            // Check for duplicate players
            if (playerIds.has(result.player_id)) {
                validationErrors.push(`Result ${i + 1}: Player ID ${result.player_id} already has a result`);
                continue;
            }
            playerIds.add(result.player_id);

            // Verify player is in tournament
            const participant = await env.DB.prepare(`
                SELECT * FROM tournament_participants 
                WHERE tournament_id = ? AND player_id = ?
            `).bind(data.tournament_id, result.player_id).first();

            if (!participant) {
                validationErrors.push(`Result ${i + 1}: Player ID ${result.player_id} not registered for this tournament`);
            }
        }

        if (validationErrors.length > 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Validation failed',
                details: validationErrors
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Check if results already exist for this game
        const existingResults = await env.DB.prepare(`
            SELECT COUNT(*) as count FROM game_results 
            WHERE tournament_id = ? AND day_number = ? AND game_number = ?
        `).bind(data.tournament_id, data.day_number, data.game_number).first();

        if (existingResults.count > 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Results for this game already exist. Use update endpoint to modify.'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Find or create lobby for this game
        let lobby = await env.DB.prepare(`
            SELECT * FROM lobbies 
            WHERE tournament_id = ? AND day_number = ? AND game_number = ?
            LIMIT 1
        `).bind(data.tournament_id, data.day_number, data.game_number).first();

        if (!lobby) {
            // Create a default lobby
            const lobbyResult = await env.DB.prepare(`
                INSERT INTO lobbies (tournament_id, lobby_number, day_number, game_number, status)
                VALUES (?, 1, ?, ?, 'completed')
            `).bind(data.tournament_id, data.day_number, data.game_number).run();
            
            lobby = await env.DB.prepare(`
                SELECT * FROM lobbies WHERE id = ?
            `).bind(lobbyResult.meta.last_row_id).first();
        }

        // Calculate points based on placement (8 points for 1st, 7 for 2nd, etc.)
        const calculatePoints = (placement) => 9 - placement;

        // Prepare batch insert for game results
        const insertStatements = [];
        const resultEntries = [];

        for (const result of data.results) {
            const points = calculatePoints(result.placement);
            
            insertStatements.push(
                env.DB.prepare(`
                    INSERT INTO game_results (
                        tournament_id, player_id, lobby_id, day_number, 
                        game_number, placement, points
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    data.tournament_id,
                    result.player_id,
                    lobby.id,
                    data.day_number,
                    data.game_number,
                    result.placement,
                    points
                )
            );

            resultEntries.push({
                player_id: result.player_id,
                placement: result.placement,
                points: points,
                lobby_id: lobby.id
            });
        }

        // Execute all inserts in a transaction
        await env.DB.batch(insertStatements);

        // Update lobby status
        await env.DB.prepare(`
            UPDATE lobbies 
            SET status = 'completed', completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).bind(lobby.id).run();

        // Recalculate tournament statistics
        await recalculateStatsInternal(data.tournament_id, env);

        // Get the inserted results with player names
        const finalResults = await env.DB.prepare(`
            SELECT 
                gr.*,
                p.username,
                p.display_name
            FROM game_results gr
            JOIN players p ON gr.player_id = p.id
            WHERE gr.tournament_id = ? AND gr.day_number = ? AND gr.game_number = ?
            ORDER BY gr.placement ASC
        `).bind(data.tournament_id, data.day_number, data.game_number).all();

        return new Response(JSON.stringify({
            success: true,
            data: {
                tournament_id: data.tournament_id,
                day_number: data.day_number,
                game_number: data.game_number,
                lobby_id: lobby.id,
                results: finalResults.results
            },
            message: 'Game results submitted successfully'
        }), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error submitting game results:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to submit game results'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const updateGameResult = async (request, env) => {
    try {
        const url = new URL(request.url);
        const resultId = url.pathname.split('/')[5];
        const data = await request.json();

        // Get existing result
        const existingResult = await env.DB.prepare(`
            SELECT gr.*, t.status as tournament_status
            FROM game_results gr
            JOIN tournaments t ON gr.tournament_id = t.id
            WHERE gr.id = ?
        `).bind(resultId).first();

        if (!existingResult) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Game result not found'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Prevent modification of completed tournaments
        if (existingResult.tournament_status === 'completed') {
            return new Response(JSON.stringify({
                success: false,
                error: 'Cannot modify results of completed tournament'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Validate new placement if provided
        if (data.placement !== undefined) {
            if (data.placement < 1 || data.placement > 8) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Placement must be between 1 and 8'
                }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Check if new placement conflicts with other results in same game
            const conflictingResult = await env.DB.prepare(`
                SELECT id FROM game_results 
                WHERE tournament_id = ? AND day_number = ? AND game_number = ? 
                AND placement = ? AND id != ?
            `).bind(
                existingResult.tournament_id,
                existingResult.day_number,
                existingResult.game_number,
                data.placement,
                resultId
            ).first();

            if (conflictingResult) {
                return new Response(JSON.stringify({
                    success: false,
                    error: `Placement ${data.placement} is already taken by another player in this game`
                }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        // Update the result
        const newPlacement = data.placement || existingResult.placement;
        const newPoints = 9 - newPlacement;

        await env.DB.prepare(`
            UPDATE game_results 
            SET placement = ?, points = ?
            WHERE id = ?
        `).bind(newPlacement, newPoints, resultId).run();

        // Recalculate tournament statistics
        await recalculateStatsInternal(existingResult.tournament_id, env);

        // Get updated result
        const updatedResult = await env.DB.prepare(`
            SELECT 
                gr.*,
                p.username,
                p.display_name
            FROM game_results gr
            JOIN players p ON gr.player_id = p.id
            WHERE gr.id = ?
        `).bind(resultId).first();

        return new Response(JSON.stringify({
            success: true,
            data: updatedResult,
            message: 'Game result updated successfully'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error updating game result:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to update game result'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const deleteGameResult = async (request, env) => {
    try {
        const url = new URL(request.url);
        const resultId = url.pathname.split('/')[5];

        // Get existing result
        const existingResult = await env.DB.prepare(`
            SELECT gr.*, t.status as tournament_status
            FROM game_results gr
            JOIN tournaments t ON gr.tournament_id = t.id
            WHERE gr.id = ?
        `).bind(resultId).first();

        if (!existingResult) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Game result not found'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Prevent deletion from completed tournaments
        if (existingResult.tournament_status === 'completed') {
            return new Response(JSON.stringify({
                success: false,
                error: 'Cannot delete results from completed tournament'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Delete the result
        await env.DB.prepare(`
            DELETE FROM game_results WHERE id = ?
        `).bind(resultId).run();

        // Recalculate tournament statistics
        await recalculateStatsInternal(existingResult.tournament_id, env);

        return new Response(JSON.stringify({
            success: true,
            message: 'Game result deleted successfully'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error deleting game result:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to delete game result'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

// ============================================================================
// GAME RESULT QUERIES
// ============================================================================

export const getGameResults = async (request, env) => {
    try {
        const url = new URL(request.url);
        const tournamentId = url.searchParams.get('tournament_id');
        const dayNumber = url.searchParams.get('day');
        const gameNumber = url.searchParams.get('game');
        const playerId = url.searchParams.get('player_id');

        let query = `
            SELECT 
                gr.*,
                p.username,
                p.display_name,
                p.region,
                t.name as tournament_name,
                l.lobby_number
            FROM game_results gr
            JOIN players p ON gr.player_id = p.id
            JOIN tournaments t ON gr.tournament_id = t.id
            LEFT JOIN lobbies l ON gr.lobby_id = l.id
            WHERE 1=1
        `;

        const params = [];

        if (tournamentId) {
            query += ` AND gr.tournament_id = ?`;
            params.push(tournamentId);
        }

        if (dayNumber) {
            query += ` AND gr.day_number = ?`;
            params.push(dayNumber);
        }

        if (gameNumber) {
            query += ` AND gr.game_number = ?`;
            params.push(gameNumber);
        }

        if (playerId) {
            query += ` AND gr.player_id = ?`;
            params.push(playerId);
        }

        query += ` ORDER BY gr.tournament_id, gr.day_number, gr.game_number, gr.placement`;

        const results = await env.DB.prepare(query).bind(...params).all();

        return new Response(JSON.stringify({
            success: true,
            data: results.results
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching game results:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to fetch game results'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

export const getTournamentGameSummary = async (request, env) => {
    try {
        const url = new URL(request.url);
        const tournamentId = url.pathname.split('/')[3];

        // Get tournament info
        const tournament = await env.DB.prepare(`
            SELECT * FROM tournaments WHERE id = ?
        `).bind(tournamentId).first();

        if (!tournament) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Tournament not found'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Get game summary organized by day and game
        const gameSummary = await env.DB.prepare(`
            SELECT 
                gr.day_number,
                gr.game_number,
                COUNT(*) as players_count,
                COUNT(DISTINCT l.lobby_number) as lobby_count,
                MIN(gr.created_at) as first_result_time,
                MAX(gr.created_at) as last_result_time,
                GROUP_CONCAT(
                    p.display_name || ' (' || gr.placement || ')',
                    '; '
                ) as results_preview
            FROM game_results gr
            JOIN players p ON gr.player_id = p.id
            LEFT JOIN lobbies l ON gr.lobby_id = l.id
            WHERE gr.tournament_id = ?
            GROUP BY gr.day_number, gr.game_number
            ORDER BY gr.day_number, gr.game_number
        `).bind(tournamentId).all();

        // Organize by day
        const daysSummary = {};
        gameSummary.results.forEach(game => {
            const day = game.day_number;
            if (!daysSummary[day]) {
                daysSummary[day] = {
                    day_number: day,
                    games: []
                };
            }
            daysSummary[day].games.push(game);
        });

        // Get overall tournament progress
        const progress = await env.DB.prepare(`
            SELECT 
                COUNT(DISTINCT CONCAT(day_number, '-', game_number)) as games_completed,
                COUNT(DISTINCT day_number) as days_with_games,
                COUNT(*) as total_results,
                COUNT(DISTINCT player_id) as active_players
            FROM game_results
            WHERE tournament_id = ?
        `).bind(tournamentId).first();

        return new Response(JSON.stringify({
            success: true,
            data: {
                tournament,
                progress,
                days: Object.values(daysSummary)
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching tournament game summary:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to fetch tournament game summary'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

// ============================================================================
// BULK OPERATIONS
// ============================================================================

export const bulkSubmitGameResults = async (request, env) => {
    try {
        const data = await request.json();
        
        if (!Array.isArray(data.games) || data.games.length === 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Games array is required and must not be empty'
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const results = {
            success: [],
            errors: []
        };

        // Process each game
        for (let i = 0; i < data.games.length; i++) {
            const gameData = data.games[i];
            
            try {
                // Create a mock request for individual game submission
                const mockRequest = {
                    json: async () => gameData,
                    user: request.user
                };

                // Use existing submitGameResults function
                const response = await submitGameResults(mockRequest, env);
                const responseData = await response.json();

                if (responseData.success) {
                    results.success.push({
                        index: i,
                        game: `Day ${gameData.day_number}, Game ${gameData.game_number}`,
                        data: responseData.data
                    });
                } else {
                    results.errors.push({
                        index: i,
                        game: `Day ${gameData.day_number}, Game ${gameData.game_number}`,
                        error: responseData.error
                    });
                }
            } catch (error) {
                results.errors.push({
                    index: i,
                    game: `Day ${gameData.day_number || '?'}, Game ${gameData.game_number || '?'}`,
                    error: error.message
                });
            }
        }

        return new Response(JSON.stringify({
            success: true,
            data: results,
            summary: {
                total: data.games.length,
                successful: results.success.length,
                failed: results.errors.length
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error bulk submitting game results:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to bulk submit game results'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};

// ============================================================================
// GAME VALIDATION
// ============================================================================

export const validateGameData = async (request, env) => {
    try {
        const data = await request.json();
        const errors = [];
        const warnings = [];

        // Validate tournament exists
        const tournament = await env.DB.prepare(`
            SELECT * FROM tournaments WHERE id = ?
        `).bind(data.tournament_id).first();

        if (!tournament) {
            errors.push('Tournament not found');
        } else {
            // Check if tournament is in valid state for game submission
            if (tournament.status === 'completed') {
                errors.push('Tournament is already completed');
            }

            if (tournament.status === 'cancelled') {
                errors.push('Tournament is cancelled');
            }

            // Check day validity
            if (data.day_number > tournament.total_days) {
                errors.push(`Day ${data.day_number} exceeds tournament total days (${tournament.total_days})`);
            }

            // Check game validity
            if (data.game_number > tournament.games_per_day) {
                warnings.push(`Game ${data.game_number} exceeds typical games per day (${tournament.games_per_day})`);
            }
        }

        // Validate players exist and are registered
        if (Array.isArray(data.results)) {
            for (const result of data.results) {
                const participant = await env.DB.prepare(`
                    SELECT p.display_name
                    FROM tournament_participants tp
                    JOIN players p ON tp.player_id = p.id
                    WHERE tp.tournament_id = ? AND tp.player_id = ?
                `).bind(data.tournament_id, result.player_id).first();

                if (!participant) {
                    errors.push(`Player ID ${result.player_id} is not registered for this tournament`);
                }
            }
        }

        return new Response(JSON.stringify({
            success: true,
            valid: errors.length === 0,
            errors,
            warnings
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error validating game data:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'Failed to validate game data'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};