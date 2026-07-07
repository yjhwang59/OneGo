import type { Pool } from 'pg';
import type { Registration, RegistrationStatus } from '../store';

function rowToRegistration(r: Record<string, unknown>): Registration {
  return {
    id: r.id as string,
    tournamentId: r.tournament_id as string,
    userId: r.user_id as string,
    status: r.status as RegistrationStatus,
    categoryKey: r.category_key as string | undefined,
    createdAt: (r.created_at as Date)?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: (r.updated_at as Date)?.toISOString?.() ?? new Date().toISOString()
  };
}

export async function createRegistration(
  pool: Pool,
  params: {
    id: string;
    tournamentId: string;
    userId: string;
    categoryKey?: string;
  }
): Promise<Registration> {
  const now = new Date().toISOString();
  await pool.query(
    'INSERT INTO registrations (id, tournament_id, user_id, status, category_key, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $6::timestamptz)',
    [params.id, params.tournamentId, params.userId, 'created', params.categoryKey ?? null, now]
  );
  return {
    id: params.id,
    tournamentId: params.tournamentId,
    userId: params.userId,
    status: 'created',
    categoryKey: params.categoryKey,
    createdAt: now,
    updatedAt: now
  };
}

export async function getRegistration(pool: Pool, id: string): Promise<Registration | null> {
  const r = await pool.query(
    'SELECT id, tournament_id, user_id, status, category_key, created_at, updated_at FROM registrations WHERE id = $1',
    [id]
  );
  if (r.rows.length === 0) return null;
  return rowToRegistration(r.rows[0]);
}

export async function updateRegistrationStatus(
  pool: Pool,
  id: string,
  status: RegistrationStatus
): Promise<Registration | null> {
  const now = new Date().toISOString();
  await pool.query(
    'UPDATE registrations SET status = $1, updated_at = $2::timestamptz WHERE id = $3',
    [status, now, id]
  );
  return getRegistration(pool, id);
}

export async function listRegistrationsByTournamentId(
  pool: Pool,
  tournamentId: string
): Promise<Registration[]> {
  const r = await pool.query(
    'SELECT id, tournament_id, user_id, status, category_key, created_at, updated_at FROM registrations WHERE tournament_id = $1',
    [tournamentId]
  );
  return r.rows.map((row) => rowToRegistration(row));
}

export async function listRegistrationsByUserId(
  pool: Pool,
  userId: string
): Promise<Registration[]> {
  const r = await pool.query(
    'SELECT id, tournament_id, user_id, status, category_key, created_at, updated_at FROM registrations WHERE user_id = $1',
    [userId]
  );
  return r.rows.map((row) => rowToRegistration(row));
}

export async function findRegistrationByTournamentAndUser(
  pool: Pool,
  tournamentId: string,
  userId: string
): Promise<Registration | null> {
  const r = await pool.query(
    'SELECT id, tournament_id, user_id, status, category_key, created_at, updated_at FROM registrations WHERE tournament_id = $1 AND user_id = $2',
    [tournamentId, userId]
  );
  if (r.rows.length === 0) return null;
  return rowToRegistration(r.rows[0]);
}
