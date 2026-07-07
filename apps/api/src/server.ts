import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import Fastify from 'fastify';
import { Type } from '@sinclair/typebox';

import { canCheckIn, canGeneratePairing, canRegister, canSubmitResult, canTransitionTournament, computePublicPoints, computeStandings, getTiebreakOrderForGame, intervalsOverlap } from '@otc/core';
import { basicSwissPairing, decideFirstMove, roundRobinSchedule } from '@otc/pairing';
import { dbHealth } from './db';
import { getData, type EnsureFromGoogleParams } from './data';
import { getCaller, hasOrgAccess, hasOrgManageAccess, hasResultInputAccess, hasTournamentManageAccess, isPlatformAdmin } from './rbac';
import { getRulesPlugin } from './rules';
import type { Match, Payment, Registration, Tournament } from './store';

const app = Fastify({ logger: true });

/** 分組賽事：空字串/未設定的 categoryKey 歸為同一預設組（undefined） */
function normalizeGroupKey(v?: string | null): string | undefined {
  return v != null && v.trim() !== '' ? v : undefined;
}

app.get('/', async () => ({
  name: 'OneGo Tournament Cloud (OTC) API',
  ok: true,
  tips: ['Try GET /api/health', 'Use header x-user-id to simulate login (protected routes)'],
  endpoints: {
    health: '/api/health',
    organizations: '/api/organizations',
    tournaments: '/api/tournaments'
  }
}));

app.get('/api', async () => ({
  ok: true,
  endpoints: {
    health: 'GET /api/health',
    organizations: {
      create: 'POST /api/organizations',
      list: 'GET /api/organizations',
      get: 'GET /api/organizations/:id',
      members: 'GET /api/organizations/:id/members'
    },
    tournaments: {
      create: 'POST /api/tournaments',
      list: 'GET /api/tournaments',
      get: 'GET /api/tournaments/:id',
      update: 'PATCH /api/tournaments/:id (draft only)',
      delete: 'DELETE /api/tournaments/:id (draft only)',
      events: [
        'POST /api/tournaments/:id/events/publish',
        'POST /api/tournaments/:id/events/open-checkin',
        'POST /api/tournaments/:id/events/lock-for-pairing',
        'POST /api/tournaments/:id/events/start',
        'POST /api/tournaments/:id/events/close',
        'POST /api/tournaments/:id/events/cancel'
      ]
    }
  }
}));

app.get('/api/health', async () => {
  const db = await dbHealth();
  return { ok: true, db };
});

async function requireCaller(req: any, reply: any) {
  const caller = getCaller(req.headers as any);
  if (!caller) {
    reply.code(401).send({ code: 'UNAUTHENTICATED', message: '需要提供 x-user-id 以模擬登入（MVP）' });
    return null;
  }
  const data = getData();
  const user = await data.ensureUser(caller.userId);
  if (user.status === 'suspended') {
    reply.code(403).send({ code: 'ACCOUNT_SUSPENDED', message: '此帳號已被停權，請聯絡平台總管' });
    return null;
  }
  return caller;
}

// ===== Organizations =====
app.post(
  '/api/organizations',
  {
    schema: {
      body: Type.Object({
        name: Type.String({ minLength: 1 }),
        slug: Type.String({ minLength: 1 })
      })
    }
  },
  async (req, reply) => {
    const caller = await requireCaller(req, reply);
    if (!caller) return;
    const data = getData();
    const org = await data.organizations.create(
      { name: (req.body as any).name, slug: (req.body as any).slug },
      caller.userId
    );
    return reply.code(201).send(org);
  }
);

app.get('/api/organizations', async (req) => {
  const caller = getCaller(req.headers as any);
  if (!caller) return [];
  const data = getData();
  await data.ensureUser(caller.userId);
  return data.organizations.listByMemberUserId(caller.userId);
});

app.get('/api/organizations/:id', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const orgId = (req.params as any).id as string;
  const data = getData();
  if (!(await hasOrgAccess(data, caller, orgId))) return reply.code(403).send({ code: 'FORBIDDEN' });
  const org = await data.organizations.get(orgId);
  if (!org) return reply.code(404).send({ code: 'NOT_FOUND' });
  return org;
});

app.patch(
  '/api/organizations/:id',
  {
    schema: {
      body: Type.Object({
        name: Type.Optional(Type.String({ minLength: 1 })),
        slug: Type.Optional(Type.String({ minLength: 1 }))
      })
    }
  },
  async (req, reply) => {
    const caller = await requireCaller(req, reply);
    if (!caller) return;
    const orgId = (req.params as any).id as string;
    const data = getData();
    if (!(await hasOrgManageAccess(data, caller, orgId))) return reply.code(403).send({ code: 'FORBIDDEN' });
    const body = req.body as { name?: string; slug?: string };
    if (body.slug !== undefined) {
      const memberships = await data.orgMemberships.listByUserId(caller.userId);
      const m = memberships.find((x) => x.organizationId === orgId);
      if (!m || m.role !== 'owner') return reply.code(403).send({ code: 'FORBIDDEN', message: '僅 owner 可編輯 slug' });
    }
    const org = await data.organizations.update(orgId, { name: body.name, slug: body.slug });
    if (!org) return reply.code(404).send({ code: 'NOT_FOUND' });
    return org;
  }
);

app.get('/api/organizations/:id/members', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const orgId = (req.params as any).id as string;
  const data = getData();
  if (!(await hasOrgManageAccess(data, caller, orgId))) return reply.code(403).send({ code: 'FORBIDDEN' });
  return data.orgMemberships.listByOrganizationId(orgId);
});

app.post(
  '/api/organizations/:id/members',
  {
    schema: {
      body: Type.Object({
        userId: Type.String({ minLength: 1 }),
        role: Type.Union([Type.Literal('owner'), Type.Literal('admin'), Type.Literal('staff')])
      })
    }
  },
  async (req, reply) => {
    const caller = await requireCaller(req, reply);
    if (!caller) return;
    const orgId = (req.params as any).id as string;
    const data = getData();
    if (!(await hasOrgManageAccess(data, caller, orgId))) return reply.code(403).send({ code: 'FORBIDDEN' });
    const body = req.body as any;
    await data.ensureUser(body.userId);
    const existing = await data.orgMemberships.find(orgId, body.userId);
    if (existing) return reply.code(409).send({ code: 'ALREADY_MEMBER' });
    const member = await data.orgMemberships.create({
      organizationId: orgId,
      userId: body.userId,
      role: body.role
    });
    return reply.code(201).send(member);
  }
);

app.post(
  '/api/organizations/:id/members/:memberId/events/change-role',
  {
    schema: {
      body: Type.Object({
        role: Type.Union([Type.Literal('owner'), Type.Literal('admin'), Type.Literal('staff')])
      })
    }
  },
  async (req, reply) => {
    const caller = await requireCaller(req, reply);
    if (!caller) return;
    const orgId = (req.params as any).id as string;
    const memberId = (req.params as any).memberId as string;
    const data = getData();
    if (!(await hasOrgManageAccess(data, caller, orgId))) return reply.code(403).send({ code: 'FORBIDDEN' });
    const membership = await data.orgMemberships.get(memberId);
    if (!membership || membership.organizationId !== orgId) return reply.code(404).send({ code: 'NOT_FOUND' });
    const body = req.body as { role: 'owner' | 'admin' | 'staff' };
    // 防呆：不可把「最後一位 owner」降級，避免主辦單位失去擁有者（孤兒）
    if (membership.role === 'owner' && body.role !== 'owner') {
      const members = await data.orgMemberships.listByOrganizationId(orgId);
      const ownerCount = members.filter((m) => m.role === 'owner').length;
      if (ownerCount <= 1) return reply.code(409).send({ code: 'LAST_OWNER', message: '不可降級最後一位擁有者；請先指派另一位擁有者。' });
    }
    const updated = await data.orgMemberships.updateRole(memberId, body.role);
    return updated;
  }
);

app.delete('/api/organizations/:id/members/:memberId', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const orgId = (req.params as any).id as string;
  const memberId = (req.params as any).memberId as string;
  const data = getData();
  if (!(await hasOrgManageAccess(data, caller, orgId))) return reply.code(403).send({ code: 'FORBIDDEN' });
  const membership = await data.orgMemberships.get(memberId);
  if (!membership || membership.organizationId !== orgId) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (membership.role === 'owner') {
    const members = await data.orgMemberships.listByOrganizationId(orgId);
    const ownerCount = members.filter((m) => m.role === 'owner').length;
    if (ownerCount <= 1) return reply.code(409).send({ code: 'LAST_OWNER', message: '不可移除最後一位擁有者' });
  }
  const deleted = await data.orgMemberships.delete(memberId);
  if (!deleted) return reply.code(404).send({ code: 'NOT_FOUND' });
  return reply.code(204).send();
});

// ===== Platform（僅 platform_admin 可呼叫）=====
async function requirePlatformAdmin(req: any, reply: any) {
  const caller = await requireCaller(req, reply);
  if (!caller) return null;
  const data = getData();
  if (!(await isPlatformAdmin(data, caller))) {
    reply.code(403).send({ code: 'FORBIDDEN', message: '僅平台總管可存取' });
    return null;
  }
  return caller;
}

// ===== Users: ensure from Google (trusted server-only; NextAuth callback) =====
app.post(
  '/api/users/ensure-from-google',
  {
    schema: {
      body: Type.Object({
        sub: Type.String({ minLength: 1 }),
        email: Type.Optional(Type.String()),
        name: Type.Optional(Type.String()),
        picture: Type.Optional(Type.String())
      })
    }
  },
  async (req, reply) => {
    const secret = process.env.OTC_SERVER_SECRET;
    if (secret) {
      const headerSecret = (req.headers as any)['x-otc-server-secret'];
      if (headerSecret !== secret) {
        return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Invalid or missing x-otc-server-secret' });
      }
    }
    const body = req.body as EnsureFromGoogleParams;
    const data = getData();
    const user = await data.ensureFromGoogle(body);
    return reply.code(200).send({
      userId: user.id,
      displayName: user.displayName,
      email: user.email ?? undefined
    });
  }
);

// ===== Platform (platform_admin only) =====
app.get('/api/platform/organizations', async (req, reply) => {
  const caller = await requirePlatformAdmin(req, reply);
  if (!caller) return;
  const data = getData();
  return data.organizations.listAll();
});

// 平台總管儀表板量化卡（P4）
app.get('/api/platform/stats', async (req, reply) => {
  const caller = await requirePlatformAdmin(req, reply);
  if (!caller) return;
  const data = getData();
  const [orgs, tournaments, recentUsers] = await Promise.all([
    data.organizations.listAll(),
    data.tournaments.list({}),
    data.users.list({ limit: 8 }), // list() 已依 createdAt 遞減排序
  ]);
  // 用戶總數：以大 limit 取回全部後計數（MVP 規模足夠）
  const allUsers = await data.users.list({ limit: 100000 });
  return {
    counts: {
      organizations: orgs.length,
      users: allUsers.length,
      tournaments: tournaments.length,
      inProgressTournaments: tournaments.filter((t) => t.status === 'in_progress').length,
    },
    recentUsers: recentUsers.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email ?? null,
      status: u.status ?? 'active',
      createdAt: u.createdAt,
    })),
  };
});

app.get('/api/platform/organizations/:id', async (req, reply) => {
  const caller = await requirePlatformAdmin(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  const data = getData();
  const org = await data.organizations.get(id);
  if (!org) return reply.code(404).send({ code: 'NOT_FOUND' });
  return org;
});

app.get('/api/platform/users', async (req, reply) => {
  const caller = await requirePlatformAdmin(req, reply);
  if (!caller) return;
  const q = req.query as { limit?: string; offset?: string; q?: string };
  const data = getData();
  const limit = q.limit != null ? Math.min(100, Math.max(1, parseInt(q.limit, 10) || 50)) : 50;
  const offset = q.offset != null ? Math.max(0, parseInt(q.offset, 10) || 0) : 0;
  return data.users.list({ limit, offset, q: q.q });
});

app.get('/api/platform/users/:id', async (req, reply) => {
  const caller = await requirePlatformAdmin(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  const data = getData();
  const user = await data.users.get(id);
  if (!user) return reply.code(404).send({ code: 'NOT_FOUND' });
  return user;
});

// 建立用戶（平台總管；用於後台手動建帳號）
app.post(
  '/api/platform/users',
  {
    schema: {
      body: Type.Object({
        id: Type.String({ minLength: 1 }),
        displayName: Type.Optional(Type.String({ minLength: 1 })),
        email: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        platformRole: Type.Optional(Type.Union([Type.Literal('platform_admin'), Type.Null()]))
      })
    }
  },
  async (req, reply) => {
    const caller = await requirePlatformAdmin(req, reply);
    if (!caller) return;
    const body = req.body as { id: string; displayName?: string; email?: string | null; platformRole?: string | null };
    const id = body.id.trim();
    if (!id) return reply.code(400).send({ code: 'INVALID_ID' });
    const data = getData();
    const existing = await data.users.get(id);
    if (existing) return reply.code(409).send({ code: 'ALREADY_EXISTS', message: '此使用者 ID 已存在' });
    try {
      const created = await data.users.create({
        id,
        displayName: (body.displayName?.trim() || id),
        email: body.email ?? null,
        platformRole: body.platformRole ?? null
      });
      return reply.code(201).send(created);
    } catch (e: any) {
      // Postgres unique_violation（多半為 email 已被使用）
      if (e?.code === '23505') return reply.code(409).send({ code: 'EMAIL_TAKEN', message: 'Email 已被其他帳號使用' });
      throw e;
    }
  }
);

app.patch(
  '/api/platform/users/:id',
  {
    schema: {
      body: Type.Object({
        displayName: Type.Optional(Type.String({ minLength: 1 })),
        email: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        platformRole: Type.Optional(Type.Union([Type.Literal('platform_admin'), Type.Null()])),
        status: Type.Optional(Type.Union([Type.Literal('active'), Type.Literal('suspended')]))
      })
    }
  },
  async (req, reply) => {
    const caller = await requirePlatformAdmin(req, reply);
    if (!caller) return;
    const id = (req.params as any).id as string;
    const body = req.body as {
      displayName?: string;
      email?: string | null;
      platformRole?: string | null;
      status?: 'active' | 'suspended';
    };
    // 防呆：平台總管不可停權自己（避免把自己鎖在系統外）
    if (body.status === 'suspended' && id === caller.userId) {
      return reply.code(409).send({ code: 'CANNOT_SUSPEND_SELF', message: '不可停權自己的帳號' });
    }
    const data = getData();
    const existing = await data.users.get(id);
    if (!existing) return reply.code(404).send({ code: 'NOT_FOUND' });
    const updated = await data.users.update(id, body);
    return updated;
  }
);

// 刪除用戶（平台總管）。有關聯資料（主辦成員/賽事角色/報名）時回 409，建議改用停權。
app.delete('/api/platform/users/:id', async (req, reply) => {
  const caller = await requirePlatformAdmin(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  if (id === caller.userId) return reply.code(409).send({ code: 'CANNOT_DELETE_SELF', message: '不可刪除自己的帳號' });
  const data = getData();
  const existing = await data.users.get(id);
  if (!existing) return reply.code(404).send({ code: 'NOT_FOUND' });
  const [memberships, tRoles, regs] = await Promise.all([
    data.orgMemberships.listByUserId(id),
    data.tournamentRoles.listByUserId(id),
    data.registrations.listByUserId(id)
  ]);
  if (memberships.length > 0 || tRoles.length > 0 || regs.length > 0) {
    return reply.code(409).send({
      code: 'USER_HAS_RELATIONS',
      message: '此用戶仍有主辦成員／賽事角色／報名紀錄，請先移除關聯或改用停權。'
    });
  }
  await data.users.delete(id);
  return reply.code(204).send();
});

// ===== Public tournaments（半公開：不需要是主辦成員也可查）=====
app.get('/api/public/tournaments', async (req) => {
  const q = req.query as any;
  const data = getData();
  return data.tournaments.listPublic({ status: q.status, gameKey: q.gameKey, keyword: q.keyword });
});

app.get('/api/public/tournaments/:id', async (req, reply) => {
  const id = (req.params as any).id as string;
  const data = getData();
  const t = await data.tournaments.get(id);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  // 半公開：不回傳 organizationId（可避免外洩主辦內部結構）
  const { organizationId: _orgId, ...publicView } = t as any;
  return publicView;
});

// ===== Tournaments =====
app.post(
  '/api/tournaments',
  {
    schema: {
      body: Type.Object({
        organizationId: Type.String({ minLength: 1 }),
        name: Type.String({ minLength: 1 }),
        gameKey: Type.Union([Type.Literal('go'), Type.Literal('chess'), Type.Literal('xiangqi'), Type.Literal('gomoku')]),
        rulesetVersion: Type.Optional(Type.String({ minLength: 1 })),
        timezone: Type.Optional(Type.String({ minLength: 1 })),
        format: Type.String({ minLength: 1 }),
        roundCount: Type.Number({ minimum: 1 }),
        startsAt: Type.Optional(Type.String()),
        endsAt: Type.Optional(Type.String())
      })
    }
  },
  async (req, reply) => {
    const caller = await requireCaller(req, reply);
    if (!caller) return;
    const body = req.body as any;
    const data = getData();
    if (!(await hasOrgManageAccess(data, caller, body.organizationId))) return reply.code(403).send({ code: 'FORBIDDEN' });
    const rules = getRulesPlugin({ gameKey: body.gameKey, rulesetVersion: body.rulesetVersion ?? 'v1' });
    if (!rules) return reply.code(400).send({ code: 'UNSUPPORTED_RULESET' });
    const t = await data.tournaments.create({
      organizationId: body.organizationId,
      name: body.name,
      gameKey: body.gameKey,
      rulesetVersion: body.rulesetVersion,
      timezone: body.timezone,
      format: body.format,
      roundCount: body.roundCount,
      startsAt: body.startsAt,
      endsAt: body.endsAt
    });
    return reply.code(201).send(t);
  }
);

app.get('/api/tournaments/:id', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  const data = getData();
  const t = await data.tournaments.get(id);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasOrgAccess(data, caller, t.organizationId))) return reply.code(403).send({ code: 'FORBIDDEN' });
  return t;
});

app.patch(
  '/api/tournaments/:id',
  {
    schema: {
      body: Type.Object({
        name: Type.Optional(Type.String({ minLength: 1 })),
        gameKey: Type.Optional(Type.Union([Type.Literal('go'), Type.Literal('chess'), Type.Literal('xiangqi'), Type.Literal('gomoku')])),
        rulesetVersion: Type.Optional(Type.String({ minLength: 1 })),
        timezone: Type.Optional(Type.String({ minLength: 1 })),
        format: Type.Optional(Type.String({ minLength: 1 })),
        roundCount: Type.Optional(Type.Number({ minimum: 1 })),
        startsAt: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        endsAt: Type.Optional(Type.Union([Type.String(), Type.Null()]))
      })
    }
  },
  async (req, reply) => {
    const caller = await requireCaller(req, reply);
    if (!caller) return;
    const id = (req.params as any).id as string;
    const body = req.body as Record<string, unknown>;
    const data = getData();
    const t = await data.tournaments.get(id);
    if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
    if (!(await hasTournamentManageAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });
    if (t.status !== 'draft') return reply.code(409).send({ code: 'INVALID_STATE', message: '僅草稿狀態的賽事可編輯' });
    const gameKey = body.gameKey ?? t.gameKey;
    const rulesetVersion = (body.rulesetVersion as string) ?? t.rulesetVersion;
    const rules = getRulesPlugin({ gameKey: gameKey as string, rulesetVersion });
    if (!rules) return reply.code(400).send({ code: 'UNSUPPORTED_RULESET' });
    const updated = await data.tournaments.update(id, {
      name: body.name as string | undefined,
      gameKey: body.gameKey as Tournament['gameKey'] | undefined,
      rulesetVersion: body.rulesetVersion as string | undefined,
      timezone: body.timezone as string | undefined,
      format: body.format as string | undefined,
      roundCount: body.roundCount as number | undefined,
      startsAt: body.startsAt !== undefined ? (body.startsAt as string | null) : undefined,
      endsAt: body.endsAt !== undefined ? (body.endsAt as string | null) : undefined
    });
    return updated;
  }
);

app.delete('/api/tournaments/:id', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  const data = getData();
  const t = await data.tournaments.get(id);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasTournamentManageAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });
  if (t.status !== 'draft') return reply.code(409).send({ code: 'INVALID_STATE', message: '僅草稿狀態的賽事可刪除' });
  await data.tournaments.delete(id);
  return reply.code(204).send();
});

app.get('/api/tournaments', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const q = req.query as any;
  const data = getData();
  const orgs = await data.organizations.listByMemberUserId(caller.userId);
  const organizationIds = orgs.map((o) => o.id);
  return data.tournaments.list({
    organizationIds: q.organizationId ? [q.organizationId] : organizationIds,
    status: q.status,
    gameKey: q.gameKey
  });
});

async function transitionTournament(tournamentId: string, next: any, req: any, reply: any) {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const data = getData();
  const t = await data.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasTournamentManageAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });
  const guard = canTransitionTournament(t.status as any, next);
  if (!guard.ok) return reply.code(409).send({ code: guard.code, message: guard.message });
  const updated = await data.tournaments.updateStatus(t.id, next);
  return updated;
}

app.post('/api/tournaments/:id/events/publish', async (req, reply) => transitionTournament((req.params as any).id, 'published', req, reply));
app.post('/api/tournaments/:id/events/open-checkin', async (req, reply) =>
  transitionTournament((req.params as any).id, 'checkin_open', req, reply)
);
app.post('/api/tournaments/:id/events/lock-for-pairing', async (req, reply) =>
  transitionTournament((req.params as any).id, 'pairing_ready', req, reply)
);
app.post('/api/tournaments/:id/events/start', async (req, reply) => transitionTournament((req.params as any).id, 'in_progress', req, reply));
app.post('/api/tournaments/:id/events/close', async (req, reply) => transitionTournament((req.params as any).id, 'closed', req, reply));
app.post('/api/tournaments/:id/events/cancel', async (req, reply) =>
  transitionTournament((req.params as any).id, 'cancelled', req, reply)
);

// ===== Registrations =====
app.post(
  '/api/tournaments/:tournamentId/registrations',
  { schema: { body: Type.Object({ userId: Type.String({ minLength: 1 }), categoryKey: Type.Optional(Type.String()) }) } },
  async (req, reply) => {
    const caller = await requireCaller(req, reply);
    if (!caller) return;
    const tournamentId = (req.params as any).tournamentId as string;
    const data = getData();
    const t = await data.tournaments.get(tournamentId);
    if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
    const guard = canRegister(t.status as any);
    if (!guard.ok) return reply.code(409).send({ code: guard.code, message: guard.message });
    const body = req.body as any;
    const isSelf = caller.userId === body.userId;
    const isOrg = await hasOrgAccess(data, caller, t.organizationId);
    if (!isSelf && !isOrg) return reply.code(403).send({ code: 'FORBIDDEN' });
    await data.ensureUser(body.userId);
    const existing = await data.registrations.find(tournamentId, body.userId);
    if (existing) return reply.code(409).send({ code: 'ALREADY_REGISTERED' });
    const r = await data.registrations.create({
      tournamentId,
      userId: body.userId,
      categoryKey: body.categoryKey
    });
    return reply.code(201).send(r);
  }
);

app.get('/api/tournaments/:tournamentId/registrations', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const tournamentId = (req.params as any).tournamentId as string;
  const data = getData();
  const t = await data.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasOrgAccess(data, caller, t.organizationId))) return reply.code(403).send({ code: 'FORBIDDEN' });
  return data.registrations.listByTournamentId(tournamentId);
});

// 報到看板：回傳各報名的報到狀態（供主辦作戰台 P3）
app.get('/api/tournaments/:tournamentId/checkins', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const tournamentId = (req.params as any).tournamentId as string;
  const data = getData();
  const t = await data.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasOrgAccess(data, caller, t.organizationId))) return reply.code(403).send({ code: 'FORBIDDEN' });
  const regs = await data.registrations.listByTournamentId(tournamentId);
  const checkins = await data.checkins.listByRegistrationIds(regs.map((r) => r.id));
  return checkins.map((c) => ({ registrationId: c.registrationId, status: c.status, checkedInAt: c.checkedInAt }));
});

app.get('/api/me', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const data = getData();
  await data.ensureUser(caller.userId);
  const user = await data.users.get(caller.userId);
  const memberships = await data.orgMemberships.listByUserId(caller.userId);
  const orgRoles = [...new Set(memberships.map((m) => m.role))];
  const tRoles = await data.tournamentRoles.listByUserId(caller.userId);
  const isReferee = tRoles.some((r) => r.role === 'referee');
  return {
    userId: caller.userId,
    displayName: user?.displayName,
    platformRole: user?.platformRole ?? null,
    orgRoles,
    isReferee,
  };
});

app.get('/api/me/registrations', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const data = getData();
  return data.registrations.listByUserId(caller.userId);
});

// 跨賽事戰績彙整（純函式彙整；供參賽者「個人中心／戰績履歷」P2）
app.get('/api/me/record', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const userId = caller.userId;
  const data = getData();

  const regs = await data.registrations.listByUserId(userId);
  const activeRegs = regs.filter((r) => r.status !== 'cancelled');
  const tournamentIds = [...new Set(regs.map((r) => r.tournamentId))];

  const tMap = new Map<string, Tournament>();
  for (const tid of tournamentIds) {
    const t = await data.tournaments.get(tid);
    if (t) tMap.set(tid, t);
  }

  type Outcome = 'win' | 'draw' | 'loss';
  type Tally = { games: number; wins: number; draws: number; losses: number };
  const emptyTally = (): Tally => ({ games: 0, wins: 0, draws: 0, losses: 0 });
  const overall = emptyTally();
  const byGame = new Map<string, Tally>();
  const opponentCount = new Map<string, number>();
  const recent: Array<{
    id: string;
    tournamentId: string;
    tournamentName: string;
    gameKey: string;
    roundNo: number;
    opponentId: string;
    outcome: Outcome;
    finishedAt: string;
  }> = [];

  for (const tid of tournamentIds) {
    const t = tMap.get(tid);
    if (!t) continue;
    const all = await data.matches.listByTournamentId(tid);
    for (const m of all) {
      if (m.status !== 'finished' || !m.result) continue;
      const isA = m.playerAId === userId;
      const isB = m.playerBId === userId;
      if (!isA && !isB) continue;
      const kind = (m.result as { kind?: string }).kind;
      if (kind === 'void') continue;
      let outcome: Outcome;
      if (kind === 'draw') outcome = 'draw';
      else if (kind === 'win') {
        const side = isA ? 'A' : 'B';
        outcome = (m.result as { winner?: string }).winner === side ? 'win' : 'loss';
      } else continue;

      const tally = byGame.get(t.gameKey) ?? emptyTally();
      tally.games++;
      overall.games++;
      if (outcome === 'win') { tally.wins++; overall.wins++; }
      else if (outcome === 'draw') { tally.draws++; overall.draws++; }
      else { tally.losses++; overall.losses++; }
      byGame.set(t.gameKey, tally);

      const opponentId = isA ? m.playerBId : m.playerAId;
      opponentCount.set(opponentId, (opponentCount.get(opponentId) ?? 0) + 1);

      recent.push({
        id: m.id,
        tournamentId: tid,
        tournamentName: t.name,
        gameKey: t.gameKey,
        roundNo: m.roundNo,
        opponentId,
        outcome,
        finishedAt: m.finishedAt ?? m.updatedAt,
      });
    }
  }

  const winRate = (x: Tally) => (x.games > 0 ? x.wins / x.games : 0);
  recent.sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1));

  // 提醒：待繳費（報名未付款且賽事仍可行動）／待報到（報到開放且尚未報到）
  const awaitingPayment = activeRegs.filter((r) => {
    const t = tMap.get(r.tournamentId);
    return (
      (r.status === 'created' || r.status === 'awaiting_payment') &&
      t &&
      (t.status === 'published' || t.status === 'checkin_open')
    );
  }).length;

  const checkinOpenRegs = activeRegs.filter((r) => tMap.get(r.tournamentId)?.status === 'checkin_open');
  const checkedInIds = await data.checkins.listCheckedInRegistrationIds(checkinOpenRegs.map((r) => r.id));
  const awaitingCheckin = checkinOpenRegs.filter((r) => !checkedInIds.has(r.id)).length;

  return {
    overall: { ...overall, winRate: winRate(overall) },
    byGame: [...byGame.entries()]
      .map(([gameKey, tally]) => ({ gameKey, ...tally, winRate: winRate(tally) }))
      .sort((a, b) => b.games - a.games),
    recentMatches: recent.slice(0, 10),
    topOpponents: [...opponentCount.entries()]
      .map(([opponentId, games]) => ({ opponentId, games }))
      .sort((a, b) => b.games - a.games)
      .slice(0, 5),
    reminders: { awaitingPayment, awaitingCheckin },
    totals: { registrations: activeRegs.length, tournaments: tournamentIds.length },
  };
});

app.post('/api/registrations/:id/events/cancel', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  const data = getData();
  const r = await data.registrations.get(id);
  if (!r) return reply.code(404).send({ code: 'NOT_FOUND' });
  const t = await data.tournaments.get(r.tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (caller.userId !== r.userId && !(await hasOrgAccess(data, caller, t.organizationId))) return reply.code(403).send({ code: 'FORBIDDEN' });
  const updated = await data.registrations.updateStatus(r.id, 'cancelled');
  return updated;
});

// ===== Payments (Mock) =====
app.post(
  '/api/registrations/:registrationId/payments',
  { schema: { body: Type.Object({ amountCents: Type.Number({ minimum: 0 }), currency: Type.Optional(Type.String()) }) } },
  async (req, reply) => {
    const caller = await requireCaller(req, reply);
    if (!caller) return;
    const registrationId = (req.params as any).registrationId as string;
    const data = getData();
    const r = await data.registrations.get(registrationId);
    if (!r) return reply.code(404).send({ code: 'NOT_FOUND' });
    const t = await data.tournaments.get(r.tournamentId);
    if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
    if (caller.userId !== r.userId && !(await hasOrgAccess(data, caller, t.organizationId))) return reply.code(403).send({ code: 'FORBIDDEN' });
    const body = req.body as any;
    const p = await data.payments.create({
      registrationId,
      amountCents: body.amountCents,
      currency: body.currency
    });
    return reply.code(201).send(p);
  }
);

app.post('/api/payments/:id/events/mark-succeeded', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  const data = getData();
  const p = await data.payments.get(id);
  if (!p) return reply.code(404).send({ code: 'NOT_FOUND' });
  const r = await data.registrations.get(p.registrationId);
  if (!r) return reply.code(404).send({ code: 'NOT_FOUND' });
  const t = await data.tournaments.get(r.tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasTournamentManageAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });
  await data.payments.updateStatus(id, 'succeeded');
  await data.registrations.updateStatus(r.id, 'paid');
  const updated = await data.payments.get(id);
  return updated;
});

app.post('/api/payments/:id/events/mark-failed', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  const data = getData();
  const p = await data.payments.get(id);
  if (!p) return reply.code(404).send({ code: 'NOT_FOUND' });
  const r = await data.registrations.get(p.registrationId);
  if (!r) return reply.code(404).send({ code: 'NOT_FOUND' });
  const t = await data.tournaments.get(r.tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasTournamentManageAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });
  const updated = await data.payments.updateStatus(id, 'failed');
  return updated;
});

// ===== Check-in =====
app.post('/api/registrations/:registrationId/checkin/events/check-in', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const registrationId = (req.params as any).registrationId as string;
  const data = getData();
  const r = await data.registrations.get(registrationId);
  if (!r) return reply.code(404).send({ code: 'NOT_FOUND' });
  const t = await data.tournaments.get(r.tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasTournamentManageAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });
  const guard = canCheckIn(t.status as any);
  if (!guard.ok) return reply.code(409).send({ code: guard.code, message: guard.message });
  const now = data.nowIso();
  return data.checkins.upsert({ registrationId, status: 'checked_in', checkedInAt: now });
});

app.post('/api/registrations/:registrationId/checkin/events/withdraw', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const registrationId = (req.params as any).registrationId as string;
  const data = getData();
  const r = await data.registrations.get(registrationId);
  if (!r) return reply.code(404).send({ code: 'NOT_FOUND' });
  const t = await data.tournaments.get(r.tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasTournamentManageAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });
  const guard = canCheckIn(t.status as any);
  if (!guard.ok) return reply.code(409).send({ code: guard.code, message: guard.message });
  return data.checkins.upsert({ registrationId, status: 'withdrawn' });
});

// ===== Pairing（瑞士制） =====
app.post(
  '/api/tournaments/:tournamentId/pairings/events/generate-round',
  { schema: { body: Type.Object({ roundNo: Type.Number({ minimum: 1 }) }) } },
  async (req, reply) => {
    const caller = await requireCaller(req, reply);
    if (!caller) return;
    const tournamentId = (req.params as any).tournamentId as string;
    const data = getData();
    const t = await data.tournaments.get(tournamentId);
    if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
    if (!(await hasTournamentManageAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });
    const guard = canGeneratePairing(t.status as any);
    if (!guard.ok) return reply.code(409).send({ code: guard.code, message: guard.message });

    const roundNo = (req.body as any).roundNo as number;
    const regs = await data.registrations.listByTournamentId(tournamentId);
    const validRegs = regs.filter((r) => r.status !== 'cancelled');
    const regIds = validRegs.map((r) => r.id);
    const checkedInIds = await data.checkins.listCheckedInRegistrationIds(regIds);
    const checkedInRegs = validRegs.filter((r) => checkedInIds.has(r.id));

    const rules = getRulesPlugin({ gameKey: t.gameKey, rulesetVersion: t.rulesetVersion });
    if (!rules) return reply.code(400).send({ code: 'UNSUPPORTED_RULESET' });

    // 依 categoryKey 分組（分組賽事）；空值歸為同一預設組（undefined）
    const normGroup = (v: string | null | undefined): string | undefined =>
      v != null && v.trim() !== '' ? v : undefined;
    const participantsByGroup = new Map<string | undefined, string[]>();
    for (const r of checkedInRegs) {
      const g = normGroup(r.categoryKey);
      if (!participantsByGroup.has(g)) participantsByGroup.set(g, []);
      participantsByGroup.get(g)!.push(r.userId);
    }

    const matchList = await data.matches.listByTournamentId(tournamentId);
    const isRoundRobin = t.format === 'round_robin' || t.format === 'double_round_robin';

    // 逐組各自配對：組內以「該組已完成對局」計積分與對手歷史（瑞士制），或依循環賽程取該輪
    const toCreate: Array<{
      tournamentId: string;
      roundNo: number;
      tableNo: number;
      categoryKey?: string;
      playerAId: string;
      playerBId: string;
      firstMove?: 'A' | 'B';
    }> = [];
    const allByes: string[] = [];
    for (const [groupKey, groupParticipants] of participantsByGroup) {
      if (isRoundRobin) {
        // 循環賽：以穩定籤序產生整份賽程，取第 roundNo 輪
        const ordered = [...groupParticipants].sort();
        const schedule = roundRobinSchedule(ordered, { double: t.format === 'double_round_robin' });
        const round = schedule.find((r) => r.roundNo === roundNo);
        if (round) {
          for (const p of round.pairs) {
            toCreate.push({
              tournamentId,
              roundNo,
              tableNo: 0,
              categoryKey: groupKey,
              playerAId: p.playerAId,
              playerBId: p.playerBId,
              firstMove: p.firstMove
            });
          }
          allByes.push(...round.byes);
        }
        continue;
      }

      // 瑞士制
      const groupFinished = matchList
        .filter((m) => m.status === 'finished' && m.result && normGroup(m.categoryKey) === groupKey)
        .map((m) => ({ playerAId: m.playerAId, playerBId: m.playerBId, result: m.result! }));
      const standings = computeStandings({ participants: groupParticipants, matches: groupFinished, rules });
      const pointsMap = new Map(standings.map((s) => [s.playerId, s.points]));
      const opponentIdsMap = new Map<string, string[]>();
      for (const pid of groupParticipants) opponentIdsMap.set(pid, []);
      for (const m of groupFinished) {
        opponentIdsMap.get(m.playerAId)?.push(m.playerBId);
        opponentIdsMap.get(m.playerBId)?.push(m.playerAId);
      }
      const pairingParticipants = groupParticipants.map((playerId) => ({
        playerId,
        currentPoints: pointsMap.get(playerId) ?? 0,
        opponentIds: opponentIdsMap.get(playerId) ?? []
      }));
      const { pairs, byes } = basicSwissPairing(pairingParticipants, { avoidRematches: true });

      // 先手平衡：以該組既有對局的先手次數為基準，逐場指派
      const firstMoveCount = new Map<string, number>();
      for (const m of matchList) {
        if (normGroup(m.categoryKey) !== groupKey || !m.firstMove) continue;
        const firstId = m.firstMove === 'A' ? m.playerAId : m.playerBId;
        firstMoveCount.set(firstId, (firstMoveCount.get(firstId) ?? 0) + 1);
      }
      for (const p of pairs) {
        const firstMove = decideFirstMove(p.playerAId, p.playerBId, firstMoveCount);
        const firstId = firstMove === 'A' ? p.playerAId : p.playerBId;
        firstMoveCount.set(firstId, (firstMoveCount.get(firstId) ?? 0) + 1);
        toCreate.push({
          tournamentId,
          roundNo,
          tableNo: 0, // 稍後於全賽事層級連續編號
          categoryKey: groupKey,
          playerAId: p.playerAId,
          playerBId: p.playerBId,
          firstMove
        });
      }
      allByes.push(...byes);
    }

    // 桌次於該輪跨組連續編號（全域唯一）
    toCreate.forEach((m, i) => {
      m.tableNo = i + 1;
    });
    const created = await data.matches.createMany(toCreate);
    if (allByes.length > 0) {
      (reply as any).header('X-Pairing-Byes', allByes.join(','));
    }
    return reply.code(201).send(created);
  }
);

// ===== Matches / Result =====
app.get('/api/tournaments/:tournamentId/matches', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const tournamentId = (req.params as any).tournamentId as string;
  const data = getData();
  const t = await data.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  // referee 需能看到該賽事所有對局（供計分），故放寬為 org 會員或可計分者（管理者/裁判）
  if (!(await hasOrgAccess(data, caller, t.organizationId)) && !(await hasResultInputAccess(data, caller, t.id)))
    return reply.code(403).send({ code: 'FORBIDDEN' });
  const q = req.query as any;
  const list = await data.matches.listByTournamentId(tournamentId, q.roundNo ? Number(q.roundNo) : undefined);
  return list;
});

// 裁判入口：列出「我是裁判」的賽事（附賽事基本資料供前端顯示）
app.get('/api/me/referee-tournaments', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const data = getData();
  const roles = await data.tournamentRoles.listByUserId(caller.userId);
  const refereeRoles = roles.filter((r) => r.role === 'referee');
  const out: Array<{ roleId: string; tournament: Tournament }> = [];
  for (const r of refereeRoles) {
    const t = await data.tournaments.get(r.tournamentId);
    if (t) out.push({ roleId: r.id, tournament: t });
  }
  return out;
});

app.get('/api/me/tournaments/:tournamentId/matches', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const tournamentId = (req.params as any).tournamentId as string;
  const data = getData();
  const list = await data.matches.listByTournamentId(tournamentId);
  return list.filter((m) => m.playerAId === caller.userId || m.playerBId === caller.userId);
});

app.post('/api/matches/:id/result', { schema: { body: Type.Object({ result: Type.Any() }) } }, async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  const data = getData();
  const m = await data.matches.get(id);
  if (!m) return reply.code(404).send({ code: 'NOT_FOUND' });
  const t = await data.tournaments.get(m.tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasResultInputAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });
  const guard = canSubmitResult(t.status as any);
  if (!guard.ok) return reply.code(409).send({ code: guard.code, message: guard.message });
  const rules = getRulesPlugin({ gameKey: t.gameKey, rulesetVersion: t.rulesetVersion });
  if (!rules) return reply.code(400).send({ code: 'UNSUPPORTED_RULESET' });
  const normalized = rules.normalizeMatchResult((req.body as any).result);
  if (!normalized.ok) return reply.code(400).send({ code: normalized.error.code, message: normalized.error.message });
  const updated = await data.matches.updateResult(id, normalized.result);
  return updated;
});

// ===== Standings =====
app.get('/api/tournaments/:tournamentId/standings', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const tournamentId = (req.params as any).tournamentId as string;
  const data = getData();
  const t = await data.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasOrgAccess(data, caller, t.organizationId))) return reply.code(403).send({ code: 'FORBIDDEN' });
  const rules = getRulesPlugin({ gameKey: t.gameKey, rulesetVersion: t.rulesetVersion });
  if (!rules) return reply.code(400).send({ code: 'UNSUPPORTED_RULESET' });

  const regs = await data.registrations.listByTournamentId(tournamentId);
  const validRegs = regs.filter((r) => r.status !== 'cancelled');
  const regIds = validRegs.map((r) => r.id);
  const checkedInIds = await data.checkins.listCheckedInRegistrationIds(regIds);
  const checkedInRegs = validRegs.filter((r) => checkedInIds.has(r.id));
  const matchList = await data.matches.listByTournamentId(tournamentId);

  // 分組賽事：依 categoryKey 各組獨立計名次；?categoryKey= 可只取單組（空字串代表預設組）
  const rawFilter = (req.query as any)?.categoryKey;
  const hasFilter = rawFilter != null;
  const filterGroup = normalizeGroupKey(rawFilter);
  const groups = new Map<string | undefined, string[]>();
  for (const r of checkedInRegs) {
    const g = normalizeGroupKey(r.categoryKey);
    if (hasFilter && g !== filterGroup) continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(r.userId);
  }

  const out: Array<Record<string, unknown>> = [];
  for (const [g, participants] of groups) {
    const matches = matchList
      .filter((m) => m.status === 'finished' && m.result && normalizeGroupKey(m.categoryKey) === g)
      .map((m) => ({ playerAId: m.playerAId, playerBId: m.playerBId, result: m.result! }));
    const rows = computeStandings({
      participants,
      matches,
      rules,
      tiebreakOrder: getTiebreakOrderForGame(t.gameKey)
    });
    for (const row of rows) out.push({ ...row, categoryKey: g ?? null });
  }
  return out;
});

app.get('/api/public/tournaments/:tournamentId/standings', async (req, reply) => {
  const tournamentId = (req.params as any).tournamentId as string;
  const data = getData();
  const t = await data.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  const rules = getRulesPlugin({ gameKey: t.gameKey, rulesetVersion: t.rulesetVersion });
  if (!rules) return reply.code(400).send({ code: 'UNSUPPORTED_RULESET' });
  const matchList = await data.matches.listByTournamentId(tournamentId);
  const rawFilter = (req.query as any)?.categoryKey;
  const hasFilter = rawFilter != null;
  const filterGroup = normalizeGroupKey(rawFilter);
  const matches = matchList
    .filter(
      (m) =>
        m.status === 'finished' &&
        m.result &&
        (!hasFilter || normalizeGroupKey(m.categoryKey) === filterGroup)
    )
    .map((m) => ({ playerAId: m.playerAId, playerBId: m.playerBId, result: m.result! }));
  return computePublicPoints({ matches, rules });
});

// 公開：分組報名清單（僅已發布或之後狀態的賽事可查，回傳 userId、categoryKey 供前端分組顯示）
app.get('/api/public/tournaments/:tournamentId/registrations', async (req, reply) => {
  const tournamentId = (req.params as any).tournamentId as string;
  const data = getData();
  const t = await data.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  const allowedStatuses = ['published', 'checkin_open', 'pairing_ready', 'in_progress', 'closed', 'cancelled'];
  if (!allowedStatuses.includes(t.status)) return reply.code(404).send({ code: 'NOT_FOUND' });
  const list = await data.registrations.listByTournamentId(tournamentId);
  return list.map((r) => ({ userId: r.userId, categoryKey: r.categoryKey ?? null }));
});

// ===== Tournament Roles（裁判/工作人員指派 + 時間衝突檢查）=====
app.get('/api/tournaments/:tournamentId/roles', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const tournamentId = (req.params as any).tournamentId as string;
  const data = getData();
  const t = await data.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasTournamentManageAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });
  return data.tournamentRoles.listByTournamentId(tournamentId);
});

app.post(
  '/api/tournaments/:tournamentId/roles',
  { schema: { body: Type.Object({ userId: Type.String({ minLength: 1 }), role: Type.Union([Type.Literal('referee'), Type.Literal('staff'), Type.Literal('organizer')]) }) } },
  async (req, reply) => {
    const caller = await requireCaller(req, reply);
    if (!caller) return;
    const tournamentId = (req.params as any).tournamentId as string;
    const data = getData();
    const t = await data.tournaments.get(tournamentId);
    if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
    if (!(await hasTournamentManageAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });

    const body = req.body as any;
    await data.ensureUser(body.userId);

    const existingRole = await data.tournamentRoles.find(tournamentId, body.userId, body.role);
    if (existingRole) return reply.code(409).send({ code: 'ALREADY_ASSIGNED' });

    if (body.role === 'referee' || body.role === 'staff') {
      const userRoles = await data.tournamentRoles.listByUserId(body.userId);
      for (const r of userRoles) {
        if (r.role !== 'referee' && r.role !== 'staff') continue;
        const other = await data.tournaments.get(r.tournamentId);
        if (!other) continue;
        if (intervalsOverlap(t.startsAt, t.endsAt, other.startsAt, other.endsAt)) {
          return reply.code(409).send({ code: 'SCHEDULE_CONFLICT' });
        }
      }
    }

    const tr = await data.tournamentRoles.create({ tournamentId, userId: body.userId, role: body.role });
    return reply.code(201).send(tr);
  }
);

app.delete('/api/tournaments/:tournamentId/roles/:roleId', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const tournamentId = (req.params as any).tournamentId as string;
  const roleId = (req.params as any).roleId as string;
  const data = getData();
  const t = await data.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasTournamentManageAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });
  const roles = await data.tournamentRoles.listByTournamentId(tournamentId);
  const existing = roles.find((r) => r.id === roleId);
  if (!existing) return reply.code(404).send({ code: 'NOT_FOUND' });
  await data.tournamentRoles.delete(roleId);
  return reply.code(204).send();
});

const port = Number(process.env.PORT ?? 3875);
const host = process.env.HOST ?? '::';

app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});


