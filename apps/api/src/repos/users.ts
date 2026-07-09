import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { User } from '../store';

const USER_COLS = 'id, email, display_name, platform_role, status, avatar_url, google_sub, created_at';

function rowToUser(r: Record<string, unknown>): User {
  return {
    id: r.id as string,
    displayName: (r.display_name as string) ?? `User-${(r.id as string).slice(0, 6)}`,
    email: r.email as string | undefined,
    platformRole: (r.platform_role as string) === 'platform_admin' ? 'platform_admin' : undefined,
    status: (r.status as string) === 'suspended' ? 'suspended' : 'active',
    avatarUrl: (r.avatar_url as string) ?? undefined,
    googleSub: (r.google_sub as string) ?? undefined,
    createdAt: (r.created_at as Date)?.toISOString?.() ?? new Date().toISOString()
  };
}

export type EnsureFromGoogleParams = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

/** Find or create user by Google sub/email; return OTC user. */
export async function ensureFromGoogle(
  pool: Pool,
  params: EnsureFromGoogleParams
): Promise<User> {
  const { sub, email, name, picture } = params;
  const displayName = (name && name.trim()) || email || `User-${sub.slice(0, 8)}`;

  // 1) Find by google_sub
  let r = await pool.query(
    `SELECT ${USER_COLS} FROM users WHERE google_sub = $1`,
    [sub]
  );
  if (r.rows.length > 0) {
    await pool.query(
      'UPDATE users SET display_name = $1, avatar_url = $2, updated_at = now() WHERE id = $3',
      [displayName, picture ?? null, r.rows[0].id]
    );
    const updated = await pool.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [r.rows[0].id]);
    return rowToUser(updated.rows[0]);
  }

  // 2) Find by email (link existing account)
  if (email && email.trim()) {
    r = await pool.query(
      `SELECT ${USER_COLS} FROM users WHERE email = $1`,
      [email.trim()]
    );
    if (r.rows.length > 0) {
      await pool.query(
        'UPDATE users SET google_sub = $1, display_name = $2, avatar_url = $3, updated_at = now() WHERE id = $4',
        [sub, displayName, picture ?? null, r.rows[0].id]
      );
      const updated = await pool.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [r.rows[0].id]);
      return rowToUser(updated.rows[0]);
    }
  }

  // 3) Create new user (id = UUID)
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users (id, email, display_name, platform_role, google_sub, avatar_url, created_at, updated_at)
     VALUES ($1, $2, $3, null, $4, $5, now(), now())`,
    [id, email?.trim() || null, displayName, sub, picture ?? null]
  );
  const inserted = await pool.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]);
  return rowToUser(inserted.rows[0]);
}

export async function ensureUser(pool: Pool, userId: string): Promise<User> {
  const existing = await pool.query(
    `SELECT ${USER_COLS} FROM users WHERE id = $1`,
    [userId]
  );
  if (existing.rows.length > 0) {
    return rowToUser(existing.rows[0]);
  }
  await pool.query(
    'INSERT INTO users (id, display_name, created_at, updated_at) VALUES ($1, $2, now(), now())',
    [userId, `User-${userId.slice(0, 6)}`]
  );
  const inserted = await pool.query(
    `SELECT ${USER_COLS} FROM users WHERE id = $1`,
    [userId]
  );
  return rowToUser(inserted.rows[0]);
}

export async function getUser(pool: Pool, id: string): Promise<User | null> {
  const r = await pool.query(
    `SELECT ${USER_COLS} FROM users WHERE id = $1`,
    [id]
  );
  if (r.rows.length === 0) return null;
  return rowToUser(r.rows[0]);
}

export type UpdateUserParams = {
  displayName?: string;
  email?: string | null;
  platformRole?: string | null;
  status?: 'active' | 'suspended';
};

export async function updateUser(
  pool: Pool,
  id: string,
  params: UpdateUserParams
): Promise<User | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (params.displayName !== undefined) {
    updates.push(`display_name = $${idx++}`);
    values.push(params.displayName);
  }
  if (params.email !== undefined) {
    updates.push(`email = $${idx++}`);
    values.push(params.email);
  }
  if (params.platformRole !== undefined) {
    updates.push(`platform_role = $${idx++}`);
    values.push(params.platformRole);
  }
  if (params.status !== undefined) {
    updates.push(`status = $${idx++}`);
    values.push(params.status);
  }
  if (updates.length === 0) return getUser(pool, id);
  updates.push('updated_at = now()');
  values.push(id);
  await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
    values
  );
  return getUser(pool, id);
}

export async function listUsers(
  pool: Pool,
  opts: { limit?: number; offset?: number; q?: string } = {}
): Promise<{ items: User[]; total: number }> {
  const { limit = 50, offset = 0, q } = opts;
  let where = '';
  const values: unknown[] = [];
  let idx = 1;
  if (q && q.trim()) {
    where = ` WHERE id ILIKE $${idx} OR display_name ILIKE $${idx} OR email ILIKE $${idx}`;
    values.push(`%${q.trim()}%`);
    idx++;
  }
  const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM users${where}`, values);
  const total = (countR.rows[0]?.total as number) ?? 0;
  let sql = `SELECT ${USER_COLS} FROM users${where} ORDER BY created_at DESC`;
  sql += ` LIMIT $${idx} OFFSET $${idx + 1}`;
  values.push(limit, offset);
  const r = await pool.query(sql, values);
  return { items: r.rows.map((row) => rowToUser(row)), total };
}

export async function isEmailTaken(pool: Pool, email: string, excludeUserId?: string): Promise<boolean> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return false;
  const r = excludeUserId
    ? await pool.query('SELECT 1 FROM users WHERE lower(email) = $1 AND id <> $2 LIMIT 1', [trimmed, excludeUserId])
    : await pool.query('SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1', [trimmed]);
  return r.rows.length > 0;
}

export async function createUser(
  pool: Pool,
  params: { id: string; displayName: string; email?: string | null; platformRole?: string | null }
): Promise<User> {
  await pool.query(
    'INSERT INTO users (id, display_name, email, platform_role, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, now(), now())',
    [params.id, params.displayName, params.email ?? null, params.platformRole ?? null, 'active']
  );
  const r = await pool.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [params.id]);
  return rowToUser(r.rows[0]);
}

export async function deleteUser(pool: Pool, id: string): Promise<boolean> {
  const r = await pool.query('DELETE FROM users WHERE id = $1', [id]);
  return (r.rowCount ?? 0) > 0;
}
