// Statistics Functions - TFT Tournament Tracker
// Core statistics calculations and tiebreaker logic for controllers

// ============================================================================
// CORE STATISTICS FUNCTIONS
// ============================================================================

/**
 * Calculate tournament statistics for all players
 * Implements TFT tiebreaker rules:
 * 1. Total Tournament Points
 * 2. Highest Top 4 Finishes + 1st Places (1st places counted twice)
 * 3. Highest Number of Placements in Each Position (1st, 2nd, 3rd, etc.)
 * 4. Best Placement in Most Recent Game
 */
export const calculateTournamentStats = async (tournamentId, env) => {
    try {
        // Get all game results for the tournament
        const gameResults = await env.DB.prepare(`
            SELECT 
                player_id,
                day_number,
                game_number,
                placement,
                points,
                created_at
            FROM game_results 
            WHERE tournament_id = ?
            ORDER BY player_id, day_number, game_number
        `).bind(tournamentId).all();

        // Group results by player
        const playerStats = {};
        
        gameResults.results.forEach(result => {
            const playerId = result.player_id;
            
            if (!playerStats[playerId]) {
                playerStats[playerId] = {
                    player_id: playerId,
                    total_points: 0,
                    games_played: 0,
                    first_places: 0,
                    second_places: 0,
                    third_places: 0,
                    fourth_places: 0,
                    fifth_places: 0,
                    sixth_places: 0,
                    seventh_places: 0,
                    eighth_places: 0,
                    top_four_count: 0,
                    top_four_plus_firsts: 0,
                    game_history: []
                };
            }

            const stats = playerStats[playerId];
            
            // Update basic stats
            stats.total_points += result.points;
            stats.games_played += 1;
            
            // Update placement counts
            switch (result.placement) {
                case 1:
                    stats.first_places += 1;
                    stats.top_four_count += 1;
                    break;
                case 2:
                    stats.second_places += 1;
                    stats.top_four_count += 1;
                    break;
                case 3:
                    stats.third_places += 1;
                    stats.top_four_count += 1;
                    break;
                case 4:
                    stats.fourth_places += 1;
                    stats.top_four_count += 1;
                    break;
                case 5:
                    stats.fifth_places += 1;
                    break;
                case 6:
                    stats.sixth_places += 1;
                    break;
                case 7:
                    stats.seventh_places += 1;
                    break;
                case 8:
                    stats.eighth_places += 1;
                    break;
            }
            
            // Add to game history for recent game tiebreaker
            stats.game_history.push({
                day: result.day_number,
                game: result.game_number,
                placement: result.placement,
                created_at: result.created_at
            });
        });

        // Calculate derived stats and recent game placements
        Object.values(playerStats).forEach(stats => {
            // Top 4 + 1st places (1st places counted twice)
            stats.top_four_plus_firsts = stats.top_four_count + stats.first_places;
            
            // Sort game history by creation time (most recent first)
            stats.game_history.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            // Set recent game placements for tiebreakers
            stats.last_game_placement = stats.game_history[0]?.placement || 9;
            stats.second_last_game_placement = stats.game_history[1]?.placement || 9;
            stats.third_last_game_placement = stats.game_history[2]?.placement || 9;
            stats.fourth_last_game_placement = stats.game_history[3]?.placement || 9;
            stats.fifth_last_game_placement = stats.game_history[4]?.placement || 9;
            
            // End of day placement (last game of the most recent day)
            const lastDay = Math.max(...stats.game_history.map(g => g.day));
            const lastDayGames = stats.game_history.filter(g => g.day === lastDay);
            const lastGameOfDay = lastDayGames.sort((a, b) => b.game - a.game)[0];
            stats.end_of_day_placement = lastGameOfDay?.placement || 9;
        });

        return Object.values(playerStats);
    } catch (error) {
        console.error('Error calculating tournament stats:', error);
        throw error;
    }
};

/**
 * Sort players by tournament tiebreaker rules
 */
export const sortPlayersByTiebreakers = (players) => {
    return players.sort((a, b) => {
        // 1. Total Tournament Points (higher is better)
        if (a.total_points !== b.total_points) {
            return b.total_points - a.total_points;
        }
        
        // 2. Highest Top 4 Finishes + 1st Places (higher is better)
        if (a.top_four_plus_firsts !== b.top_four_plus_firsts) {
            return b.top_four_plus_firsts - a.top_four_plus_firsts;
        }
        
        // 3. Highest Number of Placements in Each Position
        // Check 1st places first, then 2nd, then 3rd, etc.
        const placementChecks = [
            'first_places', 'second_places', 'third_places', 'fourth_places',
            'fifth_places', 'sixth_places', 'seventh_places', 'eighth_places'
        ];
        
        for (const placement of placementChecks) {
            if (a[placement] !== b[placement]) {
                return b[placement] - a[placement];
            }
        }
        
        // 4. Best Placement in Most Recent Game (lower is better)
        const recentGameChecks = [
            'last_game_placement', 'second_last_game_placement', 
            'third_last_game_placement', 'fourth_last_game_placement', 
            'fifth_last_game_placement'
        ];
        
        for (const recentGame of recentGameChecks) {
            if (a[recentGame] !== b[recentGame]) {
                return a[recentGame] - b[recentGame];
            }
        }
        
        // If still tied, maintain current order
        return 0;
    });
};

/**
 * Recalculate statistics for entire tournament
 */
export const recalculateStatsInternal = async (tournamentId, env) => {
    try {
        // Calculate fresh statistics
        const playerStats = await calculateTournamentStats(tournamentId, env);
        
        // Sort by tiebreaker rules
        const sortedStats = sortPlayersByTiebreakers(playerStats);
        
        // Assign ranks
        sortedStats.forEach((player, index) => {
            player.current_rank = index + 1;
        });

        // Update database with calculated stats
        const statements = [];
        
        for (const stats of sortedStats) {
            statements.push(
                env.DB.prepare(`
                    INSERT OR REPLACE INTO tournament_stats (
                        tournament_id, player_id, total_points, games_played,
                        first_places, second_places, third_places, fourth_places,
                        fifth_places, sixth_places, seventh_places, eighth_places,
                        top_four_count, top_four_plus_firsts, current_rank,
                        end_of_day_placement, last_game_placement, 
                        second_last_game_placement, third_last_game_placement,
                        fourth_last_game_placement, fifth_last_game_placement
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    tournamentId, stats.player_id, stats.total_points, stats.games_played,
                    stats.first_places, stats.second_places, stats.third_places, stats.fourth_places,
                    stats.fifth_places, stats.sixth_places, stats.seventh_places, stats.eighth_places,
                    stats.top_four_count, stats.top_four_plus_firsts, stats.current_rank,
                    stats.end_of_day_placement, stats.last_game_placement,
                    stats.second_last_game_placement, stats.third_last_game_placement,
                    stats.fourth_last_game_placement, stats.fifth_last_game_placement
                )
            );
        }
        
        // Execute all updates in a batch
        if (statements.length > 0) {
            await env.DB.batch(statements);
        }
        
        return sortedStats;
    } catch (error) {
        console.error('Error in recalculateStatsInternal:', error);
        throw error;
    }
};

/**
 * Update statistics when a new game result is added
 */
export const updateStatsForGameResult = async (tournamentId, gameResult, env) => {
    try {
        // Get current stats for the player
        let playerStats = await env.DB.prepare(`
            SELECT * FROM tournament_stats 
            WHERE tournament_id = ? AND player_id = ?
        `).bind(tournamentId, gameResult.player_id).first();

        // If no stats exist, create them
        if (!playerStats) {
            await env.DB.prepare(`
                INSERT INTO tournament_stats (tournament_id, player_id)
                VALUES (?, ?)
            `).bind(tournamentId, gameResult.player_id).run();
            
            playerStats = await env.DB.prepare(`
                SELECT * FROM tournament_stats 
                WHERE tournament_id = ? AND player_id = ?
            `).bind(tournamentId, gameResult.player_id).first();
        }

        // Update individual player stats
        const updates = {
            total_points: playerStats.total_points + gameResult.points,
            games_played: playerStats.games_played + 1
        };

        // Update placement counts
        const placementField = getPlacementField(gameResult.placement);
        if (placementField) {
            updates[placementField] = playerStats[placementField] + 1;
        }

        // Update top four count
        if (gameResult.placement <= 4) {
            updates.top_four_count = playerStats.top_four_count + 1;
        }

        // Build update query
        const updateFields = Object.keys(updates).map(field => `${field} = ?`).join(', ');
        const updateValues = Object.values(updates);
        updateValues.push(tournamentId, gameResult.player_id);

        await env.DB.prepare(`
            UPDATE tournament_stats 
            SET ${updateFields}
            WHERE tournament_id = ? AND player_id = ?
        `).bind(...updateValues).run();

        // Recalculate rankings for the entire tournament
        await recalculateStatsInternal(tournamentId, env);
        
        return true;
    } catch (error) {
        console.error('Error updating stats for game result:', error);
        throw error;
    }
};

const getPlacementField = (placement) => {
    const fields = {
        1: 'first_places',
        2: 'second_places', 
        3: 'third_places',
        4: 'fourth_places',
        5: 'fifth_places',
        6: 'sixth_places',
        7: 'seventh_places',
        8: 'eighth_places'
    };
    return fields[placement];
};