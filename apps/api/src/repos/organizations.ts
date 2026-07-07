import type { Pool } from 'pg';
import type { Organization } from '../store';

function rowToOrg(r: Record<string, unknown>): Organization {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    createdAt: (r.created_at as Date)?.toISOString?.() ?? new Date().toISOString()
  };
}

export async function createOrganization(
  pool: Pool,
  params: { id: string; name: string; slug: string }
): Promise<Organization> {
  const now = new Date().toISOString();
  await pool.query(
    'INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, $4::timestamptz, $4::timestamptz)',
    [params.id, params.name, params.slug, now]
  );
  return { id: params.id, name: params.name, slug: params.slug, createdAt: now };
}

export async function getOrganization(pool: Pool, id: string): Promise<Organization | null> {
  const r = await pool.query(
    'SELECT id, name, slug, created_at FROM organizations WHERE id = $1',
    [id]
  );
  if (r.rows.length === 0) return null;
  return rowToOrg(r.rows[0]);
}

export async function listOrganizationsByIds(pool: Pool, ids: string[]): Promise<Organization[]> {
  if (ids.length === 0) return [];
  const r = await pool.query(
    'SELECT id, name, slug, created_at FROM organizations WHERE id = ANY($1::uuid[])',
    [ids]
  );
  return r.rows.map((row) => rowToOrg(row));
}

export async function listAllOrganizations(pool: Pool): Promise<Organization[]> {
  const r = await pool.query(
    'SELECT id, name, slug, created_at FROM organizations ORDER BY created_at DESC'
  );
  return r.rows.map((row) => rowToOrg(row));
}

export async function updateOrganization(
  pool: Pool,
  id: string,
  params: { name?: string; slug?: string }
): Promise<Organization | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (params.name !== undefined) {
    updates.push(`name = $${i++}`);
    values.push(params.name);
  }
  if (params.slug !== undefined) {
    updates.push(`slug = $${i++}`);
    values.push(params.slug);
  }
  if (updates.length === 0) return getOrganization(pool, id);
  values.push(id);
  await pool.query(
    `UPDATE organizations SET ${updates.join(', ')}, updated_at = now() WHERE id = $${i}`,
    values
  );
  return getOrganization(pool, id);
}
