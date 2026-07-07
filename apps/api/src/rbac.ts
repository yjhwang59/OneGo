import type { DataSource } from './data';
import type { Id } from './store';

export type Caller = {
  userId: Id;
};

/**
 * MVP 認證：
 * - 目前用 request header `x-user-id` 模擬登入
 * - 若沒有提供，視為未登入（由 route 決定要不要回 401）
 */
export function getCaller(headers: Record<string, unknown>): Caller | null {
  const userId = typeof headers['x-user-id'] === 'string' ? (headers['x-user-id'] as string) : undefined;
  if (!userId) return null;
  return { userId };
}

export async function hasOrgAccess(data: DataSource, caller: Caller, organizationId: Id): Promise<boolean> {
  if (await isPlatformAdmin(data, caller)) return true;
  const memberships = await data.orgMemberships.listByUserId(caller.userId);
  return memberships.some((m) => m.organizationId === organizationId);
}

export async function hasOrgManageAccess(data: DataSource, caller: Caller, organizationId: Id): Promise<boolean> {
  if (await isPlatformAdmin(data, caller)) return true;
  const memberships = await data.orgMemberships.listByUserId(caller.userId);
  const m = memberships.find((x) => x.organizationId === organizationId);
  return m != null && (m.role === 'owner' || m.role === 'admin');
}

export async function hasTournamentManageAccess(
  data: DataSource,
  caller: Caller,
  tournamentId: Id
): Promise<boolean> {
  if (await isPlatformAdmin(data, caller)) return true;
  const t = await data.tournaments.get(tournamentId);
  if (!t) return false;
  if (await hasOrgManageAccess(data, caller, t.organizationId)) return true;
  const roles = await data.tournamentRoles.listByTournamentId(tournamentId);
  return roles.some((r) => r.userId === caller.userId && r.role === 'organizer');
}

/**
 * 可輸入對局成績：管理者（org owner/admin、tournament organizer）或該賽事的裁判（referee）。
 * 用於 POST /api/matches/:id/result — 讓被指派的裁判可對該賽事任一場計分。
 */
export async function hasResultInputAccess(
  data: DataSource,
  caller: Caller,
  tournamentId: Id
): Promise<boolean> {
  if (await isPlatformAdmin(data, caller)) return true;
  if (await hasTournamentManageAccess(data, caller, tournamentId)) return true;
  const roles = await data.tournamentRoles.listByTournamentId(tournamentId);
  return roles.some((r) => r.userId === caller.userId && r.role === 'referee');
}

/** 平台總管：可檢視全平台主辦與用戶，與主辦內 owner/admin 無關 */
export async function isPlatformAdmin(data: DataSource, caller: Caller): Promise<boolean> {
  const user = await data.users.get(caller.userId);
  return user?.platformRole === 'platform_admin';
}
