import type { Pool } from 'pg';
import type { PlayerRatingRow, RatingHistoryRow, RatingJob, GameKey } from '../store';

const PR_COLS =
  'player_id, game_key, current_rating, peak_rating, lowest_rating, games_played, wins, draws, losses, last_calculated_at';

function rowToPR(r: Record<string, unknown>): PlayerRatingRow {
  return {
    playerId: r.player_id as string,
    gameKey: r.game_key as GameKey,
    currentRating: Number(r.current_rating),
    peakRating: Number(r.peak_rating),
    lowestRating: Number(r.lowest_rating),
    gamesPlayed: Number(r.games_played),
    wins: Number(r.wins),
    draws: Number(r.draws),
    losses: Number(r.losses),
    lastCalculatedAt: r.last_calculated_at ? (r.last_calculated_at as Date).toISOString() : undefined,
  };
}

export async function getPlayerRatings(pool: Pool, playerIds: string[], gameKey: string): Promise<PlayerRatingRow[]> {
  if (playerIds.length === 0) return [];
  const r = await pool.query(
    `SELECT ${PR_COLS} FROM player_ratings WHERE game_key = $1 AND player_id = ANY($2::text[])`,
    [gameKey, playerIds]
  );
  return r.rows.map(rowToPR);
}

export async function leaderboard(pool: Pool, gameKey: string, limit: number, offset: number): Promise<PlayerRatingRow[]> {
  const r = await pool.query(
    `SELECT ${PR_COLS} FROM player_ratings WHERE game_key = $1 ORDER BY current_rating DESC, games_played DESC LIMIT $2 OFFSET $3`,
    [gameKey, limit, offset]
  );
  return r.rows.map(rowToPR);
}

export async function upsertPlayerRating(pool: Pool, row: PlayerRatingRow): Promise<void> {
  await pool.query(
    `INSERT INTO player_ratings
       (player_id, game_key, current_rating, peak_rating, lowest_rating, games_played, wins, draws, losses, last_calculated_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), now())
     ON CONFLICT (player_id, game_key) DO UPDATE SET
       current_rating = excluded.current_rating,
       peak_rating = excluded.peak_rating,
       lowest_rating = excluded.lowest_rating,
       games_played = excluded.games_played,
       wins = excluded.wins,
       draws = excluded.draws,
       losses = excluded.losses,
       last_calculated_at = now(),
       updated_at = now()`,
    [row.playerId, row.gameKey, row.currentRating, row.peakRating, row.lowestRating, row.gamesPlayed, row.wins, row.draws, row.losses]
  );
}

export async function appendHistory(pool: Pool, rows: RatingHistoryRow[]): Promise<void> {
  for (const h of rows) {
    await pool.query(
      `INSERT INTO rating_history
         (player_id, game_key, match_id, tournament_id, rating_before, rating_after, rating_change, k_factor_used, opponent_rating, match_result)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [h.playerId, h.gameKey, h.matchId ?? null, h.tournamentId ?? null, h.ratingBefore, h.ratingAfter, h.ratingChange, h.kFactorUsed, h.opponentRating ?? null, h.matchResult ?? null]
    );
  }
}

export async function listHistory(pool: Pool, playerId: string, gameKey: string, limit: number): Promise<RatingHistoryRow[]> {
  const r = await pool.query(
    `SELECT id, player_id, game_key, match_id, tournament_id, rating_before, rating_after, rating_change, k_factor_used, opponent_rating, match_result, calculated_at
       FROM rating_history WHERE player_id = $1 AND game_key = $2 ORDER BY calculated_at DESC LIMIT $3`,
    [playerId, gameKey, limit]
  );
  return r.rows.map((h) => ({
    id: h.id as string,
    playerId: h.player_id as string,
    gameKey: h.game_key as GameKey,
    matchId: h.match_id as string | null,
    tournamentId: h.tournament_id as string | null,
    ratingBefore: Number(h.rating_before),
    ratingAfter: Number(h.rating_after),
    ratingChange: Number(h.rating_change),
    kFactorUsed: Number(h.k_factor_used),
    opponentRating: h.opponent_rating != null ? Number(h.opponent_rating) : null,
    matchResult: (h.match_result as 'win' | 'draw' | 'loss' | null) ?? null,
    calculatedAt: (h.calculated_at as Date).toISOString(),
  }));
}

function rowToJob(r: Record<string, unknown>): RatingJob {
  return {
    id: r.id as string,
    tournamentId: r.tournament_id as string,
    gameKey: r.game_key as GameKey,
    status: r.status as RatingJob['status'],
    matchesProcessed: Number(r.matches_processed),
    playersAffected: Number(r.players_affected),
    triggeredBy: (r.triggered_by as string | null) ?? null,
    errorMessage: (r.error_message as string | null) ?? null,
    createdAt: (r.created_at as Date).toISOString(),
    completedAt: r.completed_at ? (r.completed_at as Date).toISOString() : null,
  };
}

export async function findCompletedJob(pool: Pool, tournamentId: string, gameKey: string): Promise<RatingJob | null> {
  const r = await pool.query(
    `SELECT * FROM rating_calculation_jobs WHERE tournament_id = $1 AND game_key = $2 AND status = 'completed' ORDER BY created_at DESC LIMIT 1`,
    [tournamentId, gameKey]
  );
  return r.rows.length ? rowToJob(r.rows[0]) : null;
}

export async function createJob(pool: Pool, tournamentId: string, gameKey: string, triggeredBy: string | null): Promise<RatingJob> {
  const r = await pool.query(
    `INSERT INTO rating_calculation_jobs (tournament_id, game_key, status, triggered_by, started_at)
     VALUES ($1, $2, 'processing', $3, now()) RETURNING *`,
    [tournamentId, gameKey, triggeredBy]
  );
  return rowToJob(r.rows[0]);
}

export async function updateJob(
  pool: Pool,
  id: string,
  patch: { status?: RatingJob['status']; matchesProcessed?: number; playersAffected?: number; errorMessage?: string | null }
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.status !== undefined) { sets.push(`status = $${i++}`); vals.push(patch.status); }
  if (patch.matchesProcessed !== undefined) { sets.push(`matches_processed = $${i++}`); vals.push(patch.matchesProcessed); }
  if (patch.playersAffected !== undefined) { sets.push(`players_affected = $${i++}`); vals.push(patch.playersAffected); }
  if (patch.errorMessage !== undefined) { sets.push(`error_message = $${i++}`); vals.push(patch.errorMessage); }
  if (patch.status === 'completed' || patch.status === 'failed') sets.push('completed_at = now()');
  if (sets.length === 0) return;
  vals.push(id);
  await pool.query(`UPDATE rating_calculation_jobs SET ${sets.join(', ')} WHERE id = $${i}`, vals);
}
