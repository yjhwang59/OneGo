import type { Pool } from 'pg';
import type { TournamentRole } from '../store';

function rowToRole(r: Record<string, unknown>): TournamentRole {
  return {
    id: r.id as string,
    tournamentId: r.tournament_id as string,
    userId: r.user_id as string,
    role: r.role as TournamentRole['role'],
    createdAt: (r.created_at as Date)?.toISOString?.() ?? new Date().toISOString()
  };
}

export async function createTournamentRole(
  pool: Pool,
  params: { id: string; tournamentId: string; userId: string; role: TournamentRole['role'] }
): Promise<TournamentRole> {
  const now = new Date().toISOString();
  await pool.query(
    'INSERT INTO tournament_roles (id, tournament_id, user_id, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz)',
    [params.id, params.tournamentId, params.userId, params.role, now]
  );
  return {
    id: params.id,
    tournamentId: params.tournamentId,
    userId: params.userId,
    role: params.role,
    createdAt: now
  };
}

export async function listTournamentRolesByTournamentId(
  pool: Pool,
  tournamentId: string
): Promise<TournamentRole[]> {
  const r = await pool.query(
    'SELECT id, tournament_id, user_id, role, created_at FROM tournament_roles WHERE tournament_id = $1',
    [tournamentId]
  );
  return r.rows.map((row) => rowToRole(row));
}

export async function listTournamentRolesByUserId(
  pool: Pool,
  userId: string
): Promise<TournamentRole[]> {
  const r = await pool.query(
    'SELECT id, tournament_id, user_id, role, created_at FROM tournament_roles WHERE user_id = $1',
    [userId]
  );
  return r.rows.map((row) => rowToRole(row));
}

export async function deleteTournamentRole(pool: Pool, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM tournament_roles WHERE id = $1 RETURNING id', [id]);
  return r.rowCount !== null && r.rowCount > 0;
}

export async function findTournamentRole(
  pool: Pool,
  tournamentId: string,
  userId: string,
  role: string
): Promise<TournamentRole | null> {
  const r = await pool.query(
    'SELECT id, tournament_id, user_id, role, created_at FROM tournament_roles WHERE tournament_id = $1 AND user_id = $2 AND role = $3',
    [tournamentId, userId, role]
  );
  if (r.rows.length === 0) return null;
  return rowToRole(r.rows[0]);
}
