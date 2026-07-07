import type { Pool } from 'pg';
import type { OrganizationMembership } from '../store';

function rowToMember(r: Record<string, unknown>): OrganizationMembership {
  return {
    id: r.id as string,
    organizationId: r.organization_id as string,
    userId: r.user_id as string,
    role: r.role as 'owner' | 'admin' | 'staff',
    createdAt: (r.created_at as Date)?.toISOString?.() ?? new Date().toISOString()
  };
}

export async function createOrgMembership(
  pool: Pool,
  params: { id: string; organizationId: string; userId: string; role: 'owner' | 'admin' | 'staff' }
): Promise<OrganizationMembership> {
  const now = new Date().toISOString();
  await pool.query(
    'INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz)',
    [params.id, params.organizationId, params.userId, params.role, now]
  );
  return {
    id: params.id,
    organizationId: params.organizationId,
    userId: params.userId,
    role: params.role,
    createdAt: now
  };
}

export async function listOrgMembershipsByUserId(
  pool: Pool,
  userId: string
): Promise<OrganizationMembership[]> {
  const r = await pool.query(
    'SELECT id, organization_id, user_id, role, created_at FROM organization_memberships WHERE user_id = $1',
    [userId]
  );
  return r.rows.map((row) => rowToMember(row));
}

export async function listOrgMembershipsByOrganizationId(
  pool: Pool,
  organizationId: string
): Promise<OrganizationMembership[]> {
  const r = await pool.query(
    'SELECT id, organization_id, user_id, role, created_at FROM organization_memberships WHERE organization_id = $1',
    [organizationId]
  );
  return r.rows.map((row) => rowToMember(row));
}

export async function findOrgMembership(
  pool: Pool,
  organizationId: string,
  userId: string
): Promise<OrganizationMembership | null> {
  const r = await pool.query(
    'SELECT id, organization_id, user_id, role, created_at FROM organization_memberships WHERE organization_id = $1 AND user_id = $2',
    [organizationId, userId]
  );
  if (r.rows.length === 0) return null;
  return rowToMember(r.rows[0]);
}

export async function getOrgMembershipById(
  pool: Pool,
  membershipId: string
): Promise<OrganizationMembership | null> {
  const r = await pool.query(
    'SELECT id, organization_id, user_id, role, created_at FROM organization_memberships WHERE id = $1',
    [membershipId]
  );
  if (r.rows.length === 0) return null;
  return rowToMember(r.rows[0]);
}

export async function updateOrgMembershipRole(
  pool: Pool,
  membershipId: string,
  role: 'owner' | 'admin' | 'staff'
): Promise<OrganizationMembership | null> {
  const now = new Date().toISOString();
  await pool.query(
    'UPDATE organization_memberships SET role = $1, updated_at = $2::timestamptz WHERE id = $3',
    [role, now, membershipId]
  );
  return getOrgMembershipById(pool, membershipId);
}

export async function deleteOrgMembership(
  pool: Pool,
  membershipId: string
): Promise<boolean> {
  const r = await pool.query(
    'DELETE FROM organization_memberships WHERE id = $1',
    [membershipId]
  );
  return (r.rowCount ?? 0) > 0;
}
