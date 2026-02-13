import type { Id, InMemoryStore } from './store';

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

export function hasOrgAccess(store: InMemoryStore, caller: Caller, organizationId: Id): boolean {
  for (const m of store.orgMemberships.values()) {
    if (m.organizationId === organizationId && m.userId === caller.userId) return true;
  }
  return false;
}

export function hasOrgManageAccess(store: InMemoryStore, caller: Caller, organizationId: Id): boolean {
  for (const m of store.orgMemberships.values()) {
    if (m.organizationId !== organizationId) continue;
    if (m.userId !== caller.userId) continue;
    return m.role === 'owner' || m.role === 'admin';
  }
  return false;
}

export function hasTournamentManageAccess(store: InMemoryStore, caller: Caller, tournamentId: Id): boolean {
  const t = store.tournaments.get(tournamentId);
  if (!t) return false;
  if (hasOrgManageAccess(store, caller, t.organizationId)) return true;
  for (const r of store.tournamentRoles.values()) {
    if (r.tournamentId === tournamentId && r.userId === caller.userId) {
      return r.role === 'organizer';
    }
  }
  return false;
}


