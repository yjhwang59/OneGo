import type { Pool } from 'pg';
import type { MatchFoul, MatchResultAudit, ScoreAdjustment } from '../store';
import type { NormalizedMatchResult } from '@otc/rules';

export async function createMatchFoul(
  pool: Pool,
  params: {
    id: string;
    matchId: string;
    playerId: string;
    kind: string;
    note?: string | null;
    recordedBy: string;
  }
): Promise<MatchFoul> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO match_fouls (id, match_id, player_id, kind, note, recorded_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz)`,
    [params.id, params.matchId, params.playerId, params.kind, params.note ?? null, params.recordedBy, now]
  );
  return {
    id: params.id,
    matchId: params.matchId,
    playerId: params.playerId,
    kind: params.kind,
    note: params.note ?? null,
    recordedBy: params.recordedBy,
    createdAt: now,
  };
}

export async function listFoulsByTournament(
  pool: Pool,
  tournamentId: string
): Promise<MatchFoul[]> {
  const r = await pool.query(
    `SELECT f.id, f.match_id, f.player_id, f.kind, f.note, f.recorded_by, f.created_at
       FROM match_fouls f
       JOIN matches m ON m.id = f.match_id
      WHERE m.tournament_id = $1`,
    [tournamentId]
  );
  return r.rows.map((row) => ({
    id: row.id,
    matchId: row.match_id,
    playerId: row.player_id,
    kind: row.kind,
    note: row.note,
    recordedBy: row.recorded_by,
    createdAt: (row.created_at as Date)?.toISOString?.() ?? new Date().toISOString(),
  }));
}

export async function createScoreAdjustment(
  pool: Pool,
  params: {
    id: string;
    tournamentId: string;
    playerId: string;
    delta: number;
    reason: string;
    recordedBy: string;
  }
): Promise<ScoreAdjustment> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO tournament_score_adjustments (id, tournament_id, player_id, delta, reason, recorded_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz)`,
    [params.id, params.tournamentId, params.playerId, params.delta, params.reason, params.recordedBy, now]
  );
  return {
    id: params.id,
    tournamentId: params.tournamentId,
    playerId: params.playerId,
    delta: params.delta,
    reason: params.reason,
    recordedBy: params.recordedBy,
    createdAt: now,
  };
}

export async function listScoreAdjustments(
  pool: Pool,
  tournamentId: string
): Promise<ScoreAdjustment[]> {
  const r = await pool.query(
    `SELECT id, tournament_id, player_id, delta, reason, recorded_by, created_at
       FROM tournament_score_adjustments WHERE tournament_id = $1`,
    [tournamentId]
  );
  return r.rows.map((row) => ({
    id: row.id,
    tournamentId: row.tournament_id,
    playerId: row.player_id,
    delta: Number(row.delta),
    reason: row.reason,
    recordedBy: row.recorded_by,
    createdAt: (row.created_at as Date)?.toISOString?.() ?? new Date().toISOString(),
  }));
}

export async function createMatchResultAudit(
  pool: Pool,
  params: {
    id: string;
    matchId: string;
    resultBefore?: NormalizedMatchResult | null;
    resultAfter: NormalizedMatchResult;
    changedBy: string;
  }
): Promise<MatchResultAudit> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO match_result_audits (id, match_id, result_before, result_after, changed_by, created_at)
     VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6::timestamptz)`,
    [
      params.id,
      params.matchId,
      params.resultBefore ? JSON.stringify(params.resultBefore) : null,
      JSON.stringify(params.resultAfter),
      params.changedBy,
      now,
    ]
  );
  return {
    id: params.id,
    matchId: params.matchId,
    resultBefore: params.resultBefore ?? null,
    resultAfter: params.resultAfter,
    changedBy: params.changedBy,
    createdAt: now,
  };
}
