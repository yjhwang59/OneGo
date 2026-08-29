import type { Pool } from 'pg';
import type { Tournament, TournamentStatus } from '../store';

function rowToTournament(r: Record<string, unknown>): Tournament {
  return {
    id: r.id as string,
    organizationId: r.organization_id as string,
    name: r.name as string,
    gameKey: r.game_key as Tournament['gameKey'],
    rulesetVersion: (r.ruleset_version as string) ?? 'v1',
    timezone: (r.timezone as string) ?? 'UTC',
    format: r.format as string,
    roundCount: Number(r.round_count),
    winPoint: r.win_point != null ? Number(r.win_point) : undefined,
    byePoint: r.bye_point != null ? Number(r.bye_point) : null,
    sosKeepTop: r.sos_keep_top != null ? Number(r.sos_keep_top) : null,
    startsAt: r.starts_at != null ? (r.starts_at as Date).toISOString() : undefined,
    endsAt: r.ends_at != null ? (r.ends_at as Date).toISOString() : undefined,
    status: r.status as TournamentStatus,
    createdAt: (r.created_at as Date)?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: (r.updated_at as Date)?.toISOString?.() ?? new Date().toISOString()
  };
}

export async function createTournament(
  pool: Pool,
  params: {
    id: string;
    organizationId: string;
    name: string;
    gameKey: string;
    rulesetVersion: string;
    timezone: string;
    format: string;
    roundCount: number;
    startsAt?: string;
    endsAt?: string;
  }
): Promise<Tournament> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO tournaments (
      id, organization_id, name, game_key, ruleset_version, timezone, format, round_count,
      starts_at, ends_at, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, 'draft', $11::timestamptz, $11::timestamptz)`,
    [
      params.id,
      params.organizationId,
      params.name,
      params.gameKey,
      params.rulesetVersion,
      params.timezone,
      params.format,
      params.roundCount,
      params.startsAt ?? null,
      params.endsAt ?? null,
      now
    ]
  );
  return {
    ...params,
    status: 'draft',
    createdAt: now,
    updatedAt: now
  } as Tournament;
}

export async function getTournament(pool: Pool, id: string): Promise<Tournament | null> {
  const r = await pool.query(
    `SELECT id, organization_id, name, game_key, ruleset_version, timezone, format, round_count,
            win_point, bye_point, sos_keep_top, starts_at, ends_at, status, created_at, updated_at
       FROM tournaments WHERE id = $1`,
    [id]
  );
  if (r.rows.length === 0) return null;
  return rowToTournament(r.rows[0]);
}

export async function updateTournamentStatus(
  pool: Pool,
  id: string,
  status: TournamentStatus
): Promise<Tournament | null> {
  const now = new Date().toISOString();
  await pool.query(
    'UPDATE tournaments SET status = $1, updated_at = $2::timestamptz WHERE id = $3',
    [status, now, id]
  );
  return getTournament(pool, id);
}

/** 可更新欄位（僅 draft 時由 API 允許） */
export type TournamentUpdateParams = {
  name?: string;
  gameKey?: Tournament['gameKey'];
  rulesetVersion?: string;
  timezone?: string;
  format?: string;
  roundCount?: number;
  winPoint?: number;
  byePoint?: number | null;
  sosKeepTop?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
};

export async function updateTournament(
  pool: Pool,
  id: string,
  params: TournamentUpdateParams
): Promise<Tournament | null> {
  const existing = await getTournament(pool, id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const name = params.name ?? existing.name;
  const gameKey = params.gameKey ?? existing.gameKey;
  const rulesetVersion = params.rulesetVersion ?? existing.rulesetVersion;
  const timezone = params.timezone ?? existing.timezone;
  const format = params.format ?? existing.format;
  const roundCount = params.roundCount ?? existing.roundCount;
  const winPoint = params.winPoint ?? existing.winPoint ?? 1;
  const byePoint = params.byePoint !== undefined ? params.byePoint : existing.byePoint ?? null;
  const sosKeepTop = params.sosKeepTop !== undefined ? params.sosKeepTop : existing.sosKeepTop ?? null;
  const startsAt = params.startsAt !== undefined ? params.startsAt : existing.startsAt;
  const endsAt = params.endsAt !== undefined ? params.endsAt : existing.endsAt;
  await pool.query(
    `UPDATE tournaments SET
      name = $1, game_key = $2, ruleset_version = $3, timezone = $4, format = $5, round_count = $6,
      win_point = $7, bye_point = $8, sos_keep_top = $9,
      starts_at = $10::timestamptz, ends_at = $11::timestamptz, updated_at = $12::timestamptz
    WHERE id = $13`,
    [name, gameKey, rulesetVersion, timezone, format, roundCount, winPoint, byePoint, sosKeepTop, startsAt ?? null, endsAt ?? null, now, id]
  );
  return getTournament(pool, id);
}

export async function deleteTournament(pool: Pool, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM tournaments WHERE id = $1', [id]);
  return (r.rowCount ?? 0) > 0;
}

export async function listTournaments(
  pool: Pool,
  filters: { organizationIds?: string[]; status?: string; gameKey?: string }
): Promise<Tournament[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (filters.organizationIds?.length) {
    conditions.push(`organization_id = ANY($${idx}::uuid[])`);
    values.push(filters.organizationIds);
    idx++;
  }
  if (filters.status) {
    conditions.push(`status = $${idx}`);
    values.push(filters.status);
    idx++;
  }
  if (filters.gameKey) {
    conditions.push(`game_key = $${idx}`);
    values.push(filters.gameKey);
    idx++;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const selectCols = `id, organization_id, name, game_key, ruleset_version, timezone, format, round_count, win_point, bye_point, sos_keep_top, starts_at, ends_at, status, created_at, updated_at`;
  const r = await pool.query(
    `SELECT ${selectCols} FROM tournaments ${where}`,
    values
  );
  return r.rows.map((row) => rowToTournament(row));
}

export async function listPublicTournaments(
  pool: Pool,
  filters: { status?: string; gameKey?: string; keyword?: string }
): Promise<Tournament[]> {
  const conditions: string[] = [
    "status IN ('published', 'checkin_open', 'pairing_ready', 'in_progress', 'closed')"
  ];
  const values: unknown[] = [];
  let idx = 1;
  if (filters.status) {
    conditions.push(`status = $${idx}`);
    values.push(filters.status);
    idx++;
  }
  if (filters.gameKey) {
    conditions.push(`game_key = $${idx}`);
    values.push(filters.gameKey);
    idx++;
  }
  if (filters.keyword && filters.keyword.trim()) {
    conditions.push(`name ILIKE $${idx}`);
    values.push(`%${filters.keyword.trim()}%`);
    idx++;
  }
  const selectCols = `id, organization_id, name, game_key, ruleset_version, timezone, format, round_count, win_point, bye_point, sos_keep_top, starts_at, ends_at, status, created_at, updated_at`;
  const r = await pool.query(
    `SELECT ${selectCols} FROM tournaments WHERE ${conditions.join(' AND ')}`,
    values
  );
  return r.rows.map((row) => rowToTournament(row));
}
