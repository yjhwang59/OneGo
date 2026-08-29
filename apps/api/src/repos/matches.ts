import type { Pool } from 'pg';
import type { Match, MatchEntryKind, MatchStatus } from '../store';
import type { NormalizedMatchResult } from '@otc/rules';

const MATCH_COLUMNS =
  'id, tournament_id, round_no, table_no, category_key, player_a_id, player_b_id, first_move, entry_kind, status, result, started_at, finished_at, created_at, updated_at';

function rowToMatch(r: Record<string, unknown>): Match {
  return {
    id: r.id as string,
    tournamentId: r.tournament_id as string,
    roundNo: Number(r.round_no),
    tableNo: r.table_no != null ? Number(r.table_no) : undefined,
    categoryKey: r.category_key != null ? (r.category_key as string) : undefined,
    playerAId: r.player_a_id as string,
    playerBId: r.player_b_id != null ? (r.player_b_id as string) : undefined,
    firstMove: r.first_move != null ? (r.first_move as 'A' | 'B') : undefined,
    entryKind: ((r.entry_kind as MatchEntryKind) ?? 'normal') as MatchEntryKind,
    status: r.status as MatchStatus,
    result: r.result as NormalizedMatchResult | undefined,
    createdAt: (r.created_at as Date)?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: (r.updated_at as Date)?.toISOString?.() ?? new Date().toISOString(),
    finishedAt: r.finished_at != null ? (r.finished_at as Date).toISOString() : undefined,
  };
}

export type CreateMatchParams = {
  id: string;
  tournamentId: string;
  roundNo: number;
  tableNo?: number;
  categoryKey?: string;
  playerAId: string;
  playerBId?: string;
  firstMove?: 'A' | 'B';
  entryKind?: MatchEntryKind;
  status?: MatchStatus;
  result?: NormalizedMatchResult;
};

export async function createMatch(pool: Pool, params: CreateMatchParams): Promise<Match> {
  const now = new Date().toISOString();
  const status = params.status ?? 'scheduled';
  const entryKind = params.entryKind ?? 'normal';
  await pool.query(
    `INSERT INTO matches (id, tournament_id, round_no, table_no, category_key, player_a_id, player_b_id, first_move, entry_kind, status, result, finished_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::timestamptz, $13::timestamptz, $13::timestamptz)`,
    [
      params.id,
      params.tournamentId,
      params.roundNo,
      params.tableNo ?? null,
      params.categoryKey ?? null,
      params.playerAId,
      params.playerBId ?? null,
      params.firstMove ?? null,
      entryKind,
      status,
      params.result ? JSON.stringify(params.result) : null,
      status === 'finished' ? now : null,
      now,
    ]
  );
  return {
    ...params,
    entryKind,
    status,
    createdAt: now,
    updatedAt: now,
    finishedAt: status === 'finished' ? now : undefined,
  } as Match;
}

export async function createMatches(pool: Pool, matches: CreateMatchParams[]): Promise<Match[]> {
  const results: Match[] = [];
  for (const m of matches) {
    results.push(await createMatch(pool, m));
  }
  return results;
}

export async function getMatch(pool: Pool, id: string): Promise<Match | null> {
  const r = await pool.query(`SELECT ${MATCH_COLUMNS} FROM matches WHERE id = $1`, [id]);
  if (r.rows.length === 0) return null;
  return rowToMatch(r.rows[0]);
}

export async function updateMatchResult(
  pool: Pool,
  id: string,
  result: NormalizedMatchResult
): Promise<Match | null> {
  const now = new Date().toISOString();
  await pool.query(
    'UPDATE matches SET status = $1, result = $2, finished_at = $3::timestamptz, updated_at = $3::timestamptz WHERE id = $4',
    ['finished', JSON.stringify(result), now, id]
  );
  return getMatch(pool, id);
}

export async function listMatchesByTournamentId(
  pool: Pool,
  tournamentId: string,
  roundNo?: number
): Promise<Match[]> {
  let query = `SELECT ${MATCH_COLUMNS} FROM matches WHERE tournament_id = $1`;
  const values: unknown[] = [tournamentId];
  if (roundNo != null) {
    query += ' AND round_no = $2';
    values.push(roundNo);
  }
  const r = await pool.query(query, values);
  return r.rows.map((row) => rowToMatch(row));
}
