import type { Pool } from 'pg';
import type { CheckIn, CheckInStatus } from '../store';

function rowToCheckIn(r: Record<string, unknown>): CheckIn {
  return {
    id: r.id as string,
    registrationId: r.registration_id as string,
    status: r.status as CheckInStatus,
    checkedInAt: r.checked_in_at != null ? (r.checked_in_at as Date).toISOString() : undefined,
    createdAt: (r.created_at as Date)?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: (r.updated_at as Date)?.toISOString?.() ?? new Date().toISOString()
  };
}

export async function upsertCheckIn(
  pool: Pool,
  params: {
    id: string;
    registrationId: string;
    status: CheckInStatus;
    checkedInAt?: string;
  }
): Promise<CheckIn> {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO checkins (id, registration_id, status, checked_in_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $5::timestamptz)
     ON CONFLICT (registration_id) DO UPDATE SET status = $3, checked_in_at = $4::timestamptz, updated_at = $5::timestamptz`,
    [params.id, params.registrationId, params.status, params.checkedInAt ?? now, now]
  );
  const r = await pool.query(
    'SELECT id, registration_id, status, checked_in_at, created_at, updated_at FROM checkins WHERE registration_id = $1',
    [params.registrationId]
  );
  return rowToCheckIn(r.rows[0]);
}

export async function getCheckInByRegistrationId(
  pool: Pool,
  registrationId: string
): Promise<CheckIn | null> {
  const r = await pool.query(
    'SELECT id, registration_id, status, checked_in_at, created_at, updated_at FROM checkins WHERE registration_id = $1',
    [registrationId]
  );
  if (r.rows.length === 0) return null;
  return rowToCheckIn(r.rows[0]);
}

export async function listCheckInsByRegistrationIds(
  pool: Pool,
  registrationIds: string[]
): Promise<CheckIn[]> {
  if (registrationIds.length === 0) return [];
  const r = await pool.query(
    'SELECT id, registration_id, status, checked_in_at, created_at, updated_at FROM checkins WHERE registration_id = ANY($1::uuid[])',
    [registrationIds]
  );
  return r.rows.map((row) => rowToCheckIn(row));
}
