import { randomUUID } from 'node:crypto';
import { getPool } from './db';
import type {
  CheckIn,
  Match,
  Organization,
  OrganizationMembership,
  Payment,
  Registration,
  Tournament,
  TournamentRole,
  User
} from './store';
import type { NormalizedMatchResult } from '@otc/rules';
import { store } from './store';
import * as checkinsRepo from './repos/checkins';
import * as matchesRepo from './repos/matches';
import * as orgMembershipsRepo from './repos/org-memberships';
import * as organizationsRepo from './repos/organizations';
import * as paymentsRepo from './repos/payments';
import * as registrationsRepo from './repos/registrations';
import type { TournamentUpdateParams } from './repos/tournaments';
import * as tournamentRolesRepo from './repos/tournament-roles';
import * as tournamentsRepo from './repos/tournaments';
import * as usersRepo from './repos/users';

export type EnsureFromGoogleParams = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

export type DataSource = {
  ensureUser(userId: string): Promise<User>;
  ensureFromGoogle(params: EnsureFromGoogleParams): Promise<User>;
  newId(): string;
  nowIso(): string;

  users: {
    get(id: string): Promise<User | null>;
    list(opts?: { limit?: number; offset?: number; q?: string }): Promise<User[]>;
    create(params: { id: string; displayName: string; email?: string | null; platformRole?: string | null }): Promise<User>;
    update(
      id: string,
      params: { displayName?: string; email?: string | null; platformRole?: string | null; status?: 'active' | 'suspended' }
    ): Promise<User | null>;
    delete(id: string): Promise<boolean>;
  };
  organizations: {
    create(params: { name: string; slug: string }, ownerUserId: string): Promise<Organization>;
    get(id: string): Promise<Organization | null>;
    listByMemberUserId(userId: string): Promise<Organization[]>;
    listAll(): Promise<Organization[]>;
    update(id: string, params: { name?: string; slug?: string }): Promise<Organization | null>;
  };
  orgMemberships: {
    create(params: {
      organizationId: string;
      userId: string;
      role: 'owner' | 'admin' | 'staff';
    }): Promise<OrganizationMembership>;
    get(id: string): Promise<OrganizationMembership | null>;
    updateRole(id: string, role: 'owner' | 'admin' | 'staff'): Promise<OrganizationMembership | null>;
    delete(id: string): Promise<boolean>;
    listByUserId(userId: string): Promise<OrganizationMembership[]>;
    listByOrganizationId(organizationId: string): Promise<OrganizationMembership[]>;
    find(organizationId: string, userId: string): Promise<OrganizationMembership | null>;
  };
  tournaments: {
    create(params: {
      organizationId: string;
      name: string;
      gameKey: string;
      rulesetVersion?: string;
      timezone?: string;
      format: string;
      roundCount: number;
      startsAt?: string;
      endsAt?: string;
    }): Promise<Tournament>;
    get(id: string): Promise<Tournament | null>;
    update(id: string, params: TournamentUpdateParams): Promise<Tournament | null>;
    updateStatus(id: string, status: Tournament['status']): Promise<Tournament | null>;
    delete(id: string): Promise<boolean>;
    list(filters: { organizationIds?: string[]; status?: string; gameKey?: string }): Promise<Tournament[]>;
    listPublic(filters: { status?: string; gameKey?: string; keyword?: string }): Promise<Tournament[]>;
  };
  tournamentRoles: {
    create(params: { tournamentId: string; userId: string; role: TournamentRole['role'] }): Promise<TournamentRole>;
    listByTournamentId(tournamentId: string): Promise<TournamentRole[]>;
    listByUserId(userId: string): Promise<TournamentRole[]>;
    delete(roleId: string): Promise<boolean>;
    find(tournamentId: string, userId: string, role: string): Promise<TournamentRole | null>;
  };
  registrations: {
    create(params: {
      tournamentId: string;
      userId: string;
      categoryKey?: string;
    }): Promise<Registration>;
    get(id: string): Promise<Registration | null>;
    updateStatus(id: string, status: Registration['status']): Promise<Registration | null>;
    listByTournamentId(tournamentId: string): Promise<Registration[]>;
    listByUserId(userId: string): Promise<Registration[]>;
    find(tournamentId: string, userId: string): Promise<Registration | null>;
  };
  payments: {
    create(params: {
      registrationId: string;
      amountCents?: number;
      currency?: string;
    }): Promise<Payment>;
    get(id: string): Promise<Payment | null>;
    updateStatus(id: string, status: Payment['status']): Promise<Payment | null>;
  };
  checkins: {
    upsert(params: { registrationId: string; status: CheckIn['status']; checkedInAt?: string }): Promise<CheckIn>;
    getByRegistrationId(registrationId: string): Promise<CheckIn | null>;
    listCheckedInRegistrationIds(registrationIds: string[]): Promise<Set<string>>;
    listByRegistrationIds(registrationIds: string[]): Promise<CheckIn[]>;
  };
  matches: {
    create(params: {
      tournamentId: string;
      roundNo: number;
      tableNo?: number;
      categoryKey?: string;
      playerAId: string;
      playerBId: string;
      firstMove?: 'A' | 'B';
    }): Promise<Match>;
    createMany(
      list: Array<{
        tournamentId: string;
        roundNo: number;
        tableNo?: number;
        categoryKey?: string;
        playerAId: string;
        playerBId: string;
        firstMove?: 'A' | 'B';
      }>
    ): Promise<Match[]>;
    get(id: string): Promise<Match | null>;
    updateResult(id: string, result: NormalizedMatchResult): Promise<Match | null>;
    listByTournamentId(tournamentId: string, roundNo?: number): Promise<Match[]>;
  };
};

function createInMemoryDataSource(): DataSource {
  return {
    async ensureUser(userId: string) {
      return store.ensureUser(userId);
    },
    async ensureFromGoogle(params: EnsureFromGoogleParams) {
      const { sub, email, name, picture } = params;
      const displayName = (name && name.trim()) || email || `User-${sub.slice(0, 8)}`;
      let u = store.getUserByGoogleSub(sub);
      if (u) {
        u = { ...u, displayName, avatarUrl: picture ?? u.avatarUrl };
        store.users.set(u.id, u);
        return u;
      }
      if (email && email.trim()) {
        for (const x of store.users.values()) {
          if (x.email?.toLowerCase() === email.trim().toLowerCase()) {
            u = { ...x, googleSub: sub, displayName, avatarUrl: picture ?? x.avatarUrl };
            store.users.set(u.id, u);
            return u;
          }
        }
      }
      const id = store.newId();
      u = {
        id,
        displayName,
        email: email?.trim() || undefined,
        googleSub: sub,
        avatarUrl: picture ?? undefined,
        createdAt: store.nowIso()
      };
      store.users.set(id, u);
      return u;
    },
    newId() {
      return store.newId();
    },
    nowIso() {
      return store.nowIso();
    },
    users: {
      async get(id: string) {
        return store.users.get(id) ?? null;
      },
      async list(opts = {}) {
        const { limit = 50, offset = 0, q } = opts;
        let list = [...store.users.values()];
        if (q?.trim()) {
          const lower = q.trim().toLowerCase();
          list = list.filter(
            (u) =>
              u.id.toLowerCase().includes(lower) ||
              u.displayName.toLowerCase().includes(lower) ||
              (u.email && u.email.toLowerCase().includes(lower))
          );
        }
        list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
        return list.slice(offset, offset + limit);
      },
      async create(params) {
        const u: User = {
          id: params.id,
          displayName: params.displayName,
          email: params.email ?? undefined,
          platformRole: params.platformRole === 'platform_admin' ? 'platform_admin' : null,
          status: 'active',
          createdAt: store.nowIso()
        };
        store.users.set(u.id, u);
        return u;
      },
      async delete(id: string) {
        return store.users.delete(id);
      },
      async update(
        id: string,
        params: { displayName?: string; email?: string | null; platformRole?: string | null; status?: 'active' | 'suspended' }
      ) {
        const u = store.users.get(id);
        if (!u) return null;
        const platformRole =
          params.platformRole === "platform_admin" ? "platform_admin" : params.platformRole === null ? null : u.platformRole;
        const updated: User = {
          ...u,
          ...(params.displayName !== undefined && { displayName: params.displayName }),
          ...(params.email !== undefined && { email: params.email ?? undefined }),
          ...(params.platformRole !== undefined && { platformRole }),
          ...(params.status !== undefined && { status: params.status })
        };
        store.users.set(id, updated);
        return updated;
      }
    },
    organizations: {
      async create(params, ownerUserId) {
        const id = store.newId();
        const now = store.nowIso();
        const org: Organization = { id, name: params.name, slug: params.slug, createdAt: now };
        store.organizations.set(org.id, org);
        const memberId = store.newId();
        store.orgMemberships.set(memberId, {
          id: memberId,
          organizationId: org.id,
          userId: ownerUserId,
          role: 'owner',
          createdAt: now
        });
        return org;
      },
      async get(id) {
        return store.organizations.get(id) ?? null;
      },
      async listByMemberUserId(userId) {
        const orgIds = new Set<string>();
        for (const m of store.orgMemberships.values()) {
          if (m.userId === userId) orgIds.add(m.organizationId);
        }
        return [...store.organizations.values()].filter((o) => orgIds.has(o.id));
      },
      async listAll() {
        return [...store.organizations.values()];
      },
      async update(id, params) {
        const o = store.organizations.get(id);
        if (!o) return null;
        const updated: Organization = {
          ...o,
          ...(params.name !== undefined && { name: params.name }),
          ...(params.slug !== undefined && { slug: params.slug })
        };
        store.organizations.set(id, updated);
        return updated;
      }
    },
    orgMemberships: {
      async create(params) {
        const id = store.newId();
        const now = store.nowIso();
        const m: OrganizationMembership = {
          id,
          organizationId: params.organizationId,
          userId: params.userId,
          role: params.role,
          createdAt: now
        };
        store.orgMemberships.set(id, m);
        return m;
      },
      async get(id) {
        return store.orgMemberships.get(id) ?? null;
      },
      async updateRole(id, role) {
        const m = store.orgMemberships.get(id);
        if (!m) return null;
        const updated = { ...m, role };
        store.orgMemberships.set(id, updated);
        return updated;
      },
      async delete(id) {
        return store.orgMemberships.delete(id);
      },
      async listByUserId(userId) {
        return [...store.orgMemberships.values()].filter((m) => m.userId === userId);
      },
      async listByOrganizationId(organizationId) {
        return [...store.orgMemberships.values()].filter((m) => m.organizationId === organizationId);
      },
      async find(organizationId, userId) {
        for (const m of store.orgMemberships.values()) {
          if (m.organizationId === organizationId && m.userId === userId) return m;
        }
        return null;
      }
    },
    tournaments: {
      async create(params) {
        const id = store.newId();
        const now = store.nowIso();
        const t: Tournament = {
          id,
          organizationId: params.organizationId,
          name: params.name,
          gameKey: params.gameKey as Tournament['gameKey'],
          rulesetVersion: params.rulesetVersion ?? 'v1',
          timezone: params.timezone ?? 'UTC',
          format: params.format,
          roundCount: params.roundCount,
          startsAt: params.startsAt,
          endsAt: params.endsAt,
          status: 'draft',
          createdAt: now,
          updatedAt: now
        };
        store.tournaments.set(t.id, t);
        return t;
      },
      async get(id) {
        return store.tournaments.get(id) ?? null;
      },
      async update(id, params) {
        const t = store.tournaments.get(id);
        if (!t) return null;
        const updated = {
          ...t,
          ...(params.name !== undefined && { name: params.name }),
          ...(params.gameKey !== undefined && { gameKey: params.gameKey }),
          ...(params.rulesetVersion !== undefined && { rulesetVersion: params.rulesetVersion }),
          ...(params.timezone !== undefined && { timezone: params.timezone }),
          ...(params.format !== undefined && { format: params.format }),
          ...(params.roundCount !== undefined && { roundCount: params.roundCount }),
          ...(params.startsAt !== undefined && { startsAt: params.startsAt ?? undefined }),
          ...(params.endsAt !== undefined && { endsAt: params.endsAt ?? undefined }),
          updatedAt: store.nowIso()
        };
        store.tournaments.set(id, updated);
        return updated;
      },
      async updateStatus(id, status) {
        const t = store.tournaments.get(id);
        if (!t) return null;
        const updated = { ...t, status, updatedAt: store.nowIso() };
        store.tournaments.set(id, updated);
        return updated;
      },
      async delete(id) {
        return store.tournaments.delete(id);
      },
      async list(filters) {
        let list = [...store.tournaments.values()];
        if (filters.organizationIds?.length)
          list = list.filter((t) => filters.organizationIds!.includes(t.organizationId));
        if (filters.status) list = list.filter((t) => t.status === filters.status);
        if (filters.gameKey) list = list.filter((t) => t.gameKey === filters.gameKey);
        return list;
      },
      async listPublic(filters) {
        let list = [...store.tournaments.values()].filter((t) =>
          ['published', 'checkin_open', 'pairing_ready', 'in_progress', 'closed'].includes(t.status)
        );
        if (filters.status) list = list.filter((t) => t.status === filters.status);
        if (filters.gameKey) list = list.filter((t) => t.gameKey === filters.gameKey);
        if (filters.keyword) {
          const kw = filters.keyword.trim().toLowerCase();
          if (kw) list = list.filter((t) => t.name.toLowerCase().includes(kw));
        }
        return list;
      }
    },
    tournamentRoles: {
      async create(params) {
        const id = store.newId();
        const now = store.nowIso();
        const tr: TournamentRole = {
          id,
          tournamentId: params.tournamentId,
          userId: params.userId,
          role: params.role,
          createdAt: now
        };
        store.tournamentRoles.set(tr.id, tr);
        return tr;
      },
      async listByTournamentId(tournamentId) {
        return [...store.tournamentRoles.values()].filter((r) => r.tournamentId === tournamentId);
      },
      async listByUserId(userId) {
        return [...store.tournamentRoles.values()].filter((r) => r.userId === userId);
      },
      async delete(roleId) {
        return store.tournamentRoles.delete(roleId);
      },
      async find(tournamentId, userId, role) {
        for (const r of store.tournamentRoles.values()) {
          if (r.tournamentId === tournamentId && r.userId === userId && r.role === role) return r;
        }
        return null;
      }
    },
    registrations: {
      async create(params) {
        const id = store.newId();
        const now = store.nowIso();
        const r: Registration = {
          id,
          tournamentId: params.tournamentId,
          userId: params.userId,
          status: 'created',
          categoryKey: params.categoryKey,
          createdAt: now,
          updatedAt: now
        };
        store.registrations.set(r.id, r);
        return r;
      },
      async get(id) {
        return store.registrations.get(id) ?? null;
      },
      async updateStatus(id, status) {
        const r = store.registrations.get(id);
        if (!r) return null;
        const updated = { ...r, status, updatedAt: store.nowIso() };
        store.registrations.set(id, updated);
        return updated;
      },
      async listByTournamentId(tournamentId) {
        return [...store.registrations.values()].filter((r) => r.tournamentId === tournamentId);
      },
      async listByUserId(userId) {
        return [...store.registrations.values()].filter((r) => r.userId === userId);
      },
      async find(tournamentId, userId) {
        for (const r of store.registrations.values()) {
          if (r.tournamentId === tournamentId && r.userId === userId) return r;
        }
        return null;
      }
    },
    payments: {
      async create(params) {
        const id = store.newId();
        const now = store.nowIso();
        const p: Payment = {
          id,
          registrationId: params.registrationId,
          status: 'initiated',
          providerKey: 'mock',
          amountCents: params.amountCents ?? 0,
          currency: params.currency ?? 'TWD',
          createdAt: now,
          updatedAt: now
        };
        store.payments.set(p.id, p);
        return p;
      },
      async get(id) {
        return store.payments.get(id) ?? null;
      },
      async updateStatus(id, status) {
        const p = store.payments.get(id);
        if (!p) return null;
        const updated = { ...p, status, updatedAt: store.nowIso() };
        store.payments.set(id, updated);
        return updated;
      }
    },
    checkins: {
      async upsert(params) {
        const now = store.nowIso();
        let c = [...store.checkins.values()].find((x) => x.registrationId === params.registrationId);
        if (!c) {
          c = {
            id: store.newId(),
            registrationId: params.registrationId,
            status: params.status,
            checkedInAt: params.checkedInAt ?? now,
            createdAt: now,
            updatedAt: now
          };
        } else {
          c = { ...c, status: params.status, checkedInAt: params.checkedInAt ?? c.checkedInAt, updatedAt: now };
        }
        store.checkins.set(c.id, c);
        return c;
      },
      async getByRegistrationId(registrationId) {
        const c = [...store.checkins.values()].find((x) => x.registrationId === registrationId);
        return c ?? null;
      },
      async listCheckedInRegistrationIds(registrationIds) {
        const set = new Set<string>();
        for (const c of store.checkins.values()) {
          if (c.status === 'checked_in' && registrationIds.includes(c.registrationId)) set.add(c.registrationId);
        }
        return set;
      },
      async listByRegistrationIds(registrationIds) {
        const ids = new Set(registrationIds);
        return [...store.checkins.values()].filter((c) => ids.has(c.registrationId));
      }
    },
    matches: {
      async create(params) {
        const id = store.newId();
        const now = store.nowIso();
        const m: Match = {
          id,
          tournamentId: params.tournamentId,
          roundNo: params.roundNo,
          tableNo: params.tableNo,
          categoryKey: params.categoryKey,
          playerAId: params.playerAId,
          playerBId: params.playerBId,
          firstMove: params.firstMove,
          status: 'scheduled',
          createdAt: now,
          updatedAt: now
        };
        store.matches.set(m.id, m);
        return m;
      },
      async createMany(list) {
        const out: Match[] = [];
        for (const params of list) {
          out.push(await this.create(params));
        }
        return out;
      },
      async get(id) {
        return store.matches.get(id) ?? null;
      },
      async updateResult(id, result) {
        const m = store.matches.get(id);
        if (!m) return null;
        const now = store.nowIso();
        const updated = { ...m, status: 'finished' as const, result, updatedAt: now, finishedAt: now };
        store.matches.set(id, updated);
        return updated;
      },
      async listByTournamentId(tournamentId, roundNo) {
        return [...store.matches.values()].filter((m) => {
          if (m.tournamentId !== tournamentId) return false;
          if (roundNo != null && m.roundNo !== roundNo) return false;
          return true;
        });
      }
    }
  };
}

function createPgDataSource(pool: NonNullable<ReturnType<typeof getPool>>): DataSource {
  return {
    async ensureUser(userId: string) {
      return usersRepo.ensureUser(pool, userId);
    },
    async ensureFromGoogle(params: EnsureFromGoogleParams) {
      return usersRepo.ensureFromGoogle(pool, params);
    },
    newId() {
      return randomUUID();
    },
    nowIso() {
      return new Date().toISOString();
    },
    users: {
      async get(id: string) {
        return usersRepo.getUser(pool, id);
      },
      async list(opts) {
        return usersRepo.listUsers(pool, opts ?? {});
      },
      async create(params) {
        return usersRepo.createUser(pool, params);
      },
      async delete(id: string) {
        return usersRepo.deleteUser(pool, id);
      },
      async update(
        id: string,
        params: { displayName?: string; email?: string | null; platformRole?: string | null; status?: 'active' | 'suspended' }
      ) {
        return usersRepo.updateUser(pool, id, params);
      }
    },
    organizations: {
      async create(params, ownerUserId) {
        const id = randomUUID();
        const org = await organizationsRepo.createOrganization(pool, { id, name: params.name, slug: params.slug });
        await orgMembershipsRepo.createOrgMembership(pool, {
          id: randomUUID(),
          organizationId: id,
          userId: ownerUserId,
          role: 'owner'
        });
        return org;
      },
      async get(id) {
        return organizationsRepo.getOrganization(pool, id);
      },
      async listByMemberUserId(userId) {
        const memberships = await orgMembershipsRepo.listOrgMembershipsByUserId(pool, userId);
        const ids = memberships.map((m) => m.organizationId);
        return organizationsRepo.listOrganizationsByIds(pool, ids);
      },
      async listAll() {
        return organizationsRepo.listAllOrganizations(pool);
      },
      async update(id, params) {
        return organizationsRepo.updateOrganization(pool, id, params);
      }
    },
    orgMemberships: {
      async create(params) {
        return orgMembershipsRepo.createOrgMembership(pool, {
          id: randomUUID(),
          organizationId: params.organizationId,
          userId: params.userId,
          role: params.role
        });
      },
      async get(id) {
        return orgMembershipsRepo.getOrgMembershipById(pool, id);
      },
      async updateRole(id, role) {
        return orgMembershipsRepo.updateOrgMembershipRole(pool, id, role);
      },
      async delete(id) {
        return orgMembershipsRepo.deleteOrgMembership(pool, id);
      },
      async listByUserId(userId) {
        return orgMembershipsRepo.listOrgMembershipsByUserId(pool, userId);
      },
      async listByOrganizationId(organizationId) {
        return orgMembershipsRepo.listOrgMembershipsByOrganizationId(pool, organizationId);
      },
      async find(organizationId, userId) {
        return orgMembershipsRepo.findOrgMembership(pool, organizationId, userId);
      }
    },
    tournaments: {
      async create(params) {
        const id = randomUUID();
        return tournamentsRepo.createTournament(pool, {
          id,
          organizationId: params.organizationId,
          name: params.name,
          gameKey: params.gameKey,
          rulesetVersion: params.rulesetVersion ?? 'v1',
          timezone: params.timezone ?? 'UTC',
          format: params.format,
          roundCount: params.roundCount,
          startsAt: params.startsAt,
          endsAt: params.endsAt
        });
      },
      async get(id) {
        return tournamentsRepo.getTournament(pool, id);
      },
      async update(id, params) {
        return tournamentsRepo.updateTournament(pool, id, params);
      },
      async updateStatus(id, status) {
        return tournamentsRepo.updateTournamentStatus(pool, id, status);
      },
      async delete(id) {
        return tournamentsRepo.deleteTournament(pool, id);
      },
      async list(filters) {
        return tournamentsRepo.listTournaments(pool, filters);
      },
      async listPublic(filters) {
        return tournamentsRepo.listPublicTournaments(pool, filters);
      }
    },
    tournamentRoles: {
      async create(params) {
        return tournamentRolesRepo.createTournamentRole(pool, {
          id: randomUUID(),
          tournamentId: params.tournamentId,
          userId: params.userId,
          role: params.role
        });
      },
      async listByTournamentId(tournamentId) {
        return tournamentRolesRepo.listTournamentRolesByTournamentId(pool, tournamentId);
      },
      async listByUserId(userId) {
        return tournamentRolesRepo.listTournamentRolesByUserId(pool, userId);
      },
      async delete(roleId) {
        return tournamentRolesRepo.deleteTournamentRole(pool, roleId);
      },
      async find(tournamentId, userId, role) {
        return tournamentRolesRepo.findTournamentRole(pool, tournamentId, userId, role);
      }
    },
    registrations: {
      async create(params) {
        return registrationsRepo.createRegistration(pool, {
          id: randomUUID(),
          tournamentId: params.tournamentId,
          userId: params.userId,
          categoryKey: params.categoryKey
        });
      },
      async get(id) {
        return registrationsRepo.getRegistration(pool, id);
      },
      async updateStatus(id, status) {
        return registrationsRepo.updateRegistrationStatus(pool, id, status);
      },
      async listByTournamentId(tournamentId) {
        return registrationsRepo.listRegistrationsByTournamentId(pool, tournamentId);
      },
      async listByUserId(userId) {
        return registrationsRepo.listRegistrationsByUserId(pool, userId);
      },
      async find(tournamentId, userId) {
        return registrationsRepo.findRegistrationByTournamentAndUser(pool, tournamentId, userId);
      }
    },
    payments: {
      async create(params) {
        return paymentsRepo.createPayment(pool, {
          id: randomUUID(),
          registrationId: params.registrationId,
          providerKey: 'mock',
          amountCents: params.amountCents ?? 0,
          currency: params.currency ?? 'TWD'
        });
      },
      async get(id) {
        return paymentsRepo.getPayment(pool, id);
      },
      async updateStatus(id, status) {
        return paymentsRepo.updatePaymentStatus(pool, id, status);
      }
    },
    checkins: {
      async upsert(params) {
        return checkinsRepo.upsertCheckIn(pool, {
          id: randomUUID(),
          registrationId: params.registrationId,
          status: params.status,
          checkedInAt: params.checkedInAt
        });
      },
      async getByRegistrationId(registrationId) {
        return checkinsRepo.getCheckInByRegistrationId(pool, registrationId);
      },
      async listCheckedInRegistrationIds(registrationIds) {
        const list = await checkinsRepo.listCheckInsByRegistrationIds(pool, registrationIds);
        const set = new Set<string>();
        for (const c of list) {
          if (c.status === 'checked_in') set.add(c.registrationId);
        }
        return set;
      },
      async listByRegistrationIds(registrationIds) {
        return checkinsRepo.listCheckInsByRegistrationIds(pool, registrationIds);
      }
    },
    matches: {
      async create(params) {
        return matchesRepo.createMatch(pool, {
          id: randomUUID(),
          tournamentId: params.tournamentId,
          roundNo: params.roundNo,
          tableNo: params.tableNo,
          categoryKey: params.categoryKey,
          playerAId: params.playerAId,
          playerBId: params.playerBId,
          firstMove: params.firstMove
        });
      },
      async createMany(list) {
        return matchesRepo.createMatches(
          pool,
          list.map((p) => ({
            id: randomUUID(),
            tournamentId: p.tournamentId,
            roundNo: p.roundNo,
            tableNo: p.tableNo,
            categoryKey: p.categoryKey,
            playerAId: p.playerAId,
            playerBId: p.playerBId,
            firstMove: p.firstMove
          }))
        );
      },
      async get(id) {
        return matchesRepo.getMatch(pool, id);
      },
      async updateResult(id, result) {
        return matchesRepo.updateMatchResult(pool, id, result);
      },
      async listByTournamentId(tournamentId, roundNo) {
        return matchesRepo.listMatchesByTournamentId(pool, tournamentId, roundNo);
      }
    }
  };
}

let cached: DataSource | null = null;

export function getData(): DataSource {
  if (!cached) {
    const pool = getPool();
    cached = pool ? createPgDataSource(pool) : createInMemoryDataSource();
  }
  return cached;
}
