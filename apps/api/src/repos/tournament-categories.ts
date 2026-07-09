import type { Pool } from 'pg';
import type { TournamentCategory } from '../store';

function rowToCategory(r: Record<string, unknown>): TournamentCategory {
  return {
    id: r.id as string,
    tournamentId: r.tournament_id as string,
    key: r.key as string,
    displayName: r.display_name as string,
    sortOrder: Number(r.sort_order ?? 0),
    capacity: r.capacity != null ? Number(r.capacity) : null,
    createdAt: (r.created_at as Date)?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: (r.updated_at as Date)?.toISOString?.() ?? new Date().toISOString()
  };
}

export async function createTournamentCategory(
  pool: Pool,
  params: {
    id: string;
    tournamentId: string;
    key: string;
    displayName: string;
    sortOrder?: number;
    capacity?: number | null;
  }
): Promise<TournamentCategory> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO tournament_categories (id, tournament_id, key, display_name, sort_order, capacity, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $7::timestamptz)`,
    [params.id, params.tournamentId, params.key, params.displayName, params.sortOrder ?? 0, params.capacity ?? null, now]
  );
  return {
    id: params.id,
    tournamentId: params.tournamentId,
    key: params.key,
    displayName: params.displayName,
    sortOrder: params.sortOrder ?? 0,
    capacity: params.capacity ?? null,
    createdAt: now,
    updatedAt: now
  };
}

export async function listTournamentCategoriesByTournamentId(
  pool: Pool,
  tournamentId: string
): Promise<TournamentCategory[]> {
  const r = await pool.query(
    `SELECT id, tournament_id, key, display_name, sort_order, capacity, created_at, updated_at
     FROM tournament_categories WHERE tournament_id = $1 ORDER BY sort_order ASC, display_name ASC`,
    [tournamentId]
  );
  return r.rows.map((row) => rowToCategory(row));
}

export async function getTournamentCategory(pool: Pool, id: string): Promise<TournamentCategory | null> {
  const r = await pool.query(
    `SELECT id, tournament_id, key, display_name, sort_order, capacity, created_at, updated_at
     FROM tournament_categories WHERE id = $1`,
    [id]
  );
  if (r.rows.length === 0) return null;
  return rowToCategory(r.rows[0]);
}

export async function updateTournamentCategory(
  pool: Pool,
  id: string,
  params: { displayName?: string; sortOrder?: number; capacity?: number | null }
): Promise<TournamentCategory | null> {
  const existing = await getTournamentCategory(pool, id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const displayName = params.displayName ?? existing.displayName;
  const sortOrder = params.sortOrder ?? existing.sortOrder;
  const capacity = params.capacity !== undefined ? params.capacity : existing.capacity;
  await pool.query(
    `UPDATE tournament_categories SET display_name = $1, sort_order = $2, capacity = $3, updated_at = $4::timestamptz WHERE id = $5`,
    [displayName, sortOrder, capacity ?? null, now, id]
  );
  return getTournamentCategory(pool, id);
}

export async function deleteTournamentCategory(pool: Pool, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM tournament_categories WHERE id = $1 RETURNING id', [id]);
  return r.rowCount !== null && r.rowCount > 0;
}

export async function countRegistrationsByCategoryKey(
  pool: Pool,
  tournamentId: string,
  categoryKey: string
): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM registrations
     WHERE tournament_id = $1 AND category_key = $2 AND status <> 'cancelled'`,
    [tournamentId, categoryKey]
  );
  return Number(r.rows[0]?.c ?? 0);
}
