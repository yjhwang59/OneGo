import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import Fastify from 'fastify';
import { Type } from '@sinclair/typebox';

import { canCheckIn, canGeneratePairing, canRegister, canSubmitResult, canTransitionTournament, computeStandings, getTiebreakOrderForGame, intervalsOverlap } from '@otc/core';
import { basicSwissPairing, decideFirstMove, roundRobinSchedule } from '@otc/pairing';
import { calculateEloChange, calculateKFactor, clampRating, DEFAULT_RATING_CONFIG } from '@otc/rating';
import { dbHealth, getPool } from './db';
import { getData, type DataSource, type EnsureFromGoogleParams } from './data';
import { getCaller, hasOrgAccess, hasOrgManageAccess, hasResultInputAccess, hasTournamentManageAccess, isPlatformAdmin } from './rbac';
import { getRulesPlugin } from './rules';
import type { GameKey, Match, Payment, RatingHistoryRow, Registration, Tournament, User } from './store';

const app = Fastify({ logger: true });

/** 分組賽事：空字串/未設定的 categoryKey 歸為同一預設組（undefined） */
function normalizeGroupKey(v?: string | null): string | undefined {
  return v != null && v.trim() !== '' ? v : undefined;
}

const CATEGORY_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** 驗證報名組別：有定義組別時必填且須存在；無定義時相容舊行為（單一預設組） */
async function validateRegistrationCategory(
  data: DataSource,
  tournamentId: string,
  categoryKey?: string | null,
  excludeRegistrationId?: string
): Promise<{ ok: true; key?: string } | { ok: false; code: string; message: string }> {
  const categories = await data.tournamentCategories.listByTournamentId(tournamentId);
  if (categories.length === 0) {
    return { ok: true, key: normalizeGroupKey(categoryKey) };
  }
  const trimmed = categoryKey?.trim();
  if (!trimmed) {
    return { ok: false, code: 'CATEGORY_REQUIRED', message: '請選擇組別' };
  }
  const cat = categories.find((c) => c.key === trimmed);
  if (!cat) {
    return { ok: false, code: 'INVALID_CATEGORY_KEY', message: '組別不存在' };
  }
  if (cat.capacity != null) {
    const regs = await data.registrations.listByTournamentId(tournamentId);
    const count = regs.filter(
      (r) => r.status !== 'cancelled' && r.categoryKey === cat.key && r.id !== excludeRegistrationId
    ).length;
    if (count >= cat.capacity) {
      return { ok: false, code: 'CATEGORY_FULL', message: '該組別已滿' };
    }
  }
  return { ok: true, key: cat.key };
}

/** 依已報到者與對局計算分組排名（管理端與公開端共用） */
async function buildGroupedStandings(
  data: DataSource,
  t: Tournament,
  filterCategoryKey?: string | null
): Promise<Array<Record<string, unknown>>> {
  const rules = getRulesPlugin({ gameKey: t.gameKey, rulesetVersion: t.rulesetVersion });
  if (!rules) return [];

  const regs = await data.registrations.listByTournamentId(t.id);
  const validRegs = regs.filter((r) => r.status !== 'cancelled');
  const regIds = validRegs.map((r) => r.id);
  const checkedInIds = await data.checkins.listCheckedInRegistrationIds(regIds);
  const checkedInRegs = validRegs.filter((r) => checkedInIds.has(r.id));
  const matchList = await data.matches.listByTournamentId(t.id);

  const hasFilter = filterCategoryKey != null;
  const filterGroup = normalizeGroupKey(filterCategoryKey);
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
}

/** API 回傳用戶物件（不洩漏 google_sub；管理端可附 googleLinked） */
function serializeUser(u: User, opts?: { admin?: boolean }) {
  const { googleSub, ...rest } = u;
  return {
    ...rest,
    platformRole: u.platformRole ?? null,
    status: u.status ?? 'active',
    avatarUrl: u.avatarUrl ?? null,
    ...(opts?.admin ? { googleLinked: !!googleSub } : {}),
  };
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
  const [orgs, tournaments, recentResult] = await Promise.all([
    data.organizations.listAll(),
    data.tournaments.list({}),
    data.users.list({ limit: 8 }),
  ]);
  const { items: recentUsers, total: userCount } = recentResult;
  return {
    counts: {
      organizations: orgs.length,
      users: userCount,
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
  const { items, total } = await data.users.list({ limit, offset, q: q.q });
  return {
    items: items.map((u) => serializeUser(u, { admin: true })),
    total,
    limit,
    offset,
  };
});

app.get('/api/platform/users/:id', async (req, reply) => {
  const caller = await requirePlatformAdmin(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  const data = getData();
  const user = await data.users.get(id);
  if (!user) return reply.code(404).send({ code: 'NOT_FOUND' });
  return serializeUser(user, { admin: true });
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
    if (body.email != null && body.email.trim()) {
      const taken = await data.users.isEmailTaken(body.email);
      if (taken) return reply.code(409).send({ code: 'EMAIL_TAKEN', message: 'Email 已被其他帳號使用' });
    }
    try {
      const created = await data.users.create({
        id,
        displayName: (body.displayName?.trim() || id),
        email: body.email ?? null,
        platformRole: body.platformRole ?? null
      });
      return reply.code(201).send(serializeUser(created, { admin: true }));
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
    if (body.email != null && body.email.trim()) {
      const taken = await data.users.isEmailTaken(body.email, id);
      if (taken) return reply.code(409).send({ code: 'EMAIL_TAKEN', message: 'Email 已被其他帳號使用' });
    }
    try {
      const updated = await data.users.update(id, body);
      if (!updated) return reply.code(404).send({ code: 'NOT_FOUND' });
      return serializeUser(updated, { admin: true });
    } catch (e: any) {
      if (e?.code === '23505') return reply.code(409).send({ code: 'EMAIL_TAKEN', message: 'Email 已被其他帳號使用' });
      throw e;
    }
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

// ===== Tournament Categories（賽事組別）=====
app.get('/api/tournaments/:tournamentId/categories', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const tournamentId = (req.params as any).tournamentId as string;
  const data = getData();
  const t = await data.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasOrgAccess(data, caller, t.organizationId))) return reply.code(403).send({ code: 'FORBIDDEN' });
  return data.tournamentCategories.listByTournamentId(tournamentId);
});

app.get('/api/public/tournaments/:tournamentId/categories', async (req, reply) => {
  const tournamentId = (req.params as any).tournamentId as string;
  const data = getData();
  const t = await data.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  const allowedStatuses = ['published', 'checkin_open', 'pairing_ready', 'in_progress', 'closed'];
  if (!allowedStatuses.includes(t.status)) return reply.code(404).send({ code: 'NOT_FOUND' });
  return data.tournamentCategories.listByTournamentId(tournamentId);
});

app.post(
  '/api/tournaments/:tournamentId/categories',
  {
    schema: {
      body: Type.Object({
        key: Type.String({ minLength: 1 }),
        displayName: Type.String({ minLength: 1 }),
        sortOrder: Type.Optional(Type.Number()),
        capacity: Type.Optional(Type.Union([Type.Number({ minimum: 1 }), Type.Null()]))
      })
    }
  },
  async (req, reply) => {
    const caller = await requireCaller(req, reply);
    if (!caller) return;
    const tournamentId = (req.params as any).tournamentId as string;
    const data = getData();
    const t = await data.tournaments.get(tournamentId);
    if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
    if (!(await hasTournamentManageAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });
    if (t.status === 'closed' || t.status === 'cancelled') {
      return reply.code(409).send({ code: 'CANNOT_EDIT_CATEGORIES', message: '賽事已結束或取消，無法變更組別' });
    }
    const body = req.body as { key: string; displayName: string; sortOrder?: number; capacity?: number | null };
    const key = body.key.trim().toLowerCase();
    if (!CATEGORY_KEY_PATTERN.test(key)) {
      return reply.code(400).send({ code: 'INVALID_CATEGORY_KEY', message: '組別 key 僅允許小寫英數、底線、連字號' });
    }
    const existing = await data.tournamentCategories.listByTournamentId(tournamentId);
    if (existing.some((c) => c.key === key)) {
      return reply.code(409).send({ code: 'DUPLICATE_CATEGORY_KEY' });
    }
    const cat = await data.tournamentCategories.create({
      tournamentId,
      key,
      displayName: body.displayName.trim(),
      sortOrder: body.sortOrder,
      capacity: body.capacity
    });
    return reply.code(201).send(cat);
  }
);

app.patch(
  '/api/tournaments/:tournamentId/categories/:categoryId',
  {
    schema: {
      body: Type.Object({
        displayName: Type.Optional(Type.String({ minLength: 1 })),
        sortOrder: Type.Optional(Type.Number()),
        capacity: Type.Optional(Type.Union([Type.Number({ minimum: 1 }), Type.Null()]))
      })
    }
  },
  async (req, reply) => {
    const caller = await requireCaller(req, reply);
    if (!caller) return;
    const tournamentId = (req.params as any).tournamentId as string;
    const categoryId = (req.params as any).categoryId as string;
    const data = getData();
    const t = await data.tournaments.get(tournamentId);
    if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
    if (!(await hasTournamentManageAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });
    if (t.status === 'closed' || t.status === 'cancelled') {
      return reply.code(409).send({ code: 'CANNOT_EDIT_CATEGORIES', message: '賽事已結束或取消，無法變更組別' });
    }
    const existing = await data.tournamentCategories.get(categoryId);
    if (!existing || existing.tournamentId !== tournamentId) return reply.code(404).send({ code: 'NOT_FOUND' });
    const body = req.body as { displayName?: string; sortOrder?: number; capacity?: number | null };
    const updated = await data.tournamentCategories.update(categoryId, {
      displayName: body.displayName?.trim(),
      sortOrder: body.sortOrder,
      capacity: body.capacity
    });
    return updated;
  }
);

app.delete('/api/tournaments/:tournamentId/categories/:categoryId', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const tournamentId = (req.params as any).tournamentId as string;
  const categoryId = (req.params as any).categoryId as string;
  const data = getData();
  const t = await data.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasTournamentManageAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });
  if (t.status === 'closed' || t.status === 'cancelled') {
    return reply.code(409).send({ code: 'CANNOT_EDIT_CATEGORIES', message: '賽事已結束或取消，無法變更組別' });
  }
  const existing = await data.tournamentCategories.get(categoryId);
  if (!existing || existing.tournamentId !== tournamentId) return reply.code(404).send({ code: 'NOT_FOUND' });
  const count = await data.tournamentCategories.countRegistrations(tournamentId, existing.key);
  if (count > 0) {
    return reply.code(409).send({ code: 'CATEGORY_HAS_REGISTRATIONS', message: '已有報名者，無法刪除組別' });
  }
  await data.tournamentCategories.delete(categoryId);
  return reply.code(204).send();
});

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
    const catCheck = await validateRegistrationCategory(data, tournamentId, body.categoryKey);
    if (!catCheck.ok) return reply.code(400).send({ code: catCheck.code, message: catCheck.message });
    const r = await data.registrations.create({
      tournamentId,
      userId: body.userId,
      categoryKey: catCheck.key
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
    email: user?.email ?? null,
    avatarUrl: user?.avatarUrl ?? null,
    status: user?.status ?? 'active',
    createdAt: user?.createdAt,
    googleLinked: !!user?.googleSub,
    platformRole: user?.platformRole ?? null,
    orgRoles,
    isReferee,
  };
});

app.patch(
  '/api/me',
  {
    schema: {
      body: Type.Object({
        displayName: Type.Optional(Type.String({ minLength: 1 })),
        email: Type.Optional(Type.Union([Type.String(), Type.Null()]))
      })
    }
  },
  async (req, reply) => {
    const caller = await requireCaller(req, reply);
    if (!caller) return;
    const body = req.body as { displayName?: string; email?: string | null };
    const data = getData();
    const existing = await data.users.get(caller.userId);
    if (!existing) return reply.code(404).send({ code: 'NOT_FOUND' });
    if (body.email != null && body.email.trim()) {
      const taken = await data.users.isEmailTaken(body.email, caller.userId);
      if (taken) return reply.code(409).send({ code: 'EMAIL_TAKEN', message: 'Email 已被其他帳號使用' });
    }
    try {
      const updated = await data.users.update(caller.userId, {
        displayName: body.displayName,
        email: body.email,
      });
      if (!updated) return reply.code(404).send({ code: 'NOT_FOUND' });
      const memberships = await data.orgMemberships.listByUserId(caller.userId);
      const orgRoles = [...new Set(memberships.map((m) => m.role))];
      const tRoles = await data.tournamentRoles.listByUserId(caller.userId);
      const isReferee = tRoles.some((r) => r.role === 'referee');
      return {
        userId: caller.userId,
        displayName: updated.displayName,
        email: updated.email ?? null,
        avatarUrl: updated.avatarUrl ?? null,
        status: updated.status ?? 'active',
        createdAt: updated.createdAt,
        googleLinked: !!updated.googleSub,
        platformRole: updated.platformRole ?? null,
        orgRoles,
        isReferee,
      };
    } catch (e: any) {
      if (e?.code === '23505') return reply.code(409).send({ code: 'EMAIL_TAKEN', message: 'Email 已被其他帳號使用' });
      throw e;
    }
  }
);

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

app.post(
  '/api/registrations/:id/events/change-category',
  { schema: { body: Type.Object({ categoryKey: Type.String({ minLength: 1 }) }) } },
  async (req, reply) => {
    const caller = await requireCaller(req, reply);
    if (!caller) return;
    const id = (req.params as any).id as string;
    const data = getData();
    const r = await data.registrations.get(id);
    if (!r) return reply.code(404).send({ code: 'NOT_FOUND' });
    const t = await data.tournaments.get(r.tournamentId);
    if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
    if (t.status !== 'published' && t.status !== 'checkin_open') {
      return reply.code(409).send({ code: 'CANNOT_CHANGE_CATEGORY', message: '僅報名或報到階段可變更組別' });
    }
    const isSelf = caller.userId === r.userId;
    const isOrg = await hasOrgAccess(data, caller, t.organizationId);
    if (!isSelf && !isOrg) return reply.code(403).send({ code: 'FORBIDDEN' });
    const body = req.body as { categoryKey: string };
    const catCheck = await validateRegistrationCategory(data, t.id, body.categoryKey, r.id);
    if (!catCheck.ok) return reply.code(400).send({ code: catCheck.code, message: catCheck.message });
    const updated = await data.registrations.updateCategoryKey(id, catCheck.key!);
    return updated;
  }
);

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
  if (!(await hasOrgAccess(data, caller, t.organizationId))) return reply.code(403).send({ code: 'FORBIDDEN' });
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
  if (!(await hasOrgAccess(data, caller, t.organizationId))) return reply.code(403).send({ code: 'FORBIDDEN' });
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
  const rawFilter = (req.query as any)?.categoryKey;
  const out = await buildGroupedStandings(data, t, rawFilter);
  if (out.length === 0 && !getRulesPlugin({ gameKey: t.gameKey, rulesetVersion: t.rulesetVersion })) {
    return reply.code(400).send({ code: 'UNSUPPORTED_RULESET' });
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
  const rawFilter = (req.query as any)?.categoryKey;
  return buildGroupedStandings(data, t, rawFilter);
});

// ===== ELO 等級分（Phase 1）=====

/** 對單一賽事逐場套用 ELO；經 DataSource 持久化。呼叫端需先確認冪等（無 completed job）。 */
async function computeTournamentRatings(data: DataSource, t: Tournament, triggeredBy: string) {
  const gameKey = t.gameKey as GameKey;
  const config = { ...DEFAULT_RATING_CONFIG, gameKey };
  const all = await data.matches.listByTournamentId(t.id);
  // 只計已完成、且 win/draw 的對局（void 不計）
  const rated = all
    .filter((m) => m.status === 'finished' && m.result)
    .filter((m) => {
      const k = (m.result as { kind?: string }).kind;
      return k === 'win' || k === 'draw';
    })
    .sort((a, b) => a.roundNo - b.roundNo);

  const job = await data.ratings.createJob(t.id, gameKey, triggeredBy);
  try {
    const playerIds = [...new Set(rated.flatMap((m) => [m.playerAId, m.playerBId]))];
    const existing = await data.ratings.getPlayerRatings(playerIds, gameKey);
    const prMap = new Map(existing.map((p) => [p.playerId, p]));
    const ratingMap = new Map<string, number>();
    const stat = new Map<string, { games: number; wins: number; draws: number; losses: number; peak: number; lowest: number }>();
    for (const pid of playerIds) {
      const pr = prMap.get(pid);
      const start = pr?.currentRating ?? config.defaultRating;
      ratingMap.set(pid, start);
      stat.set(pid, {
        games: pr?.gamesPlayed ?? 0,
        wins: pr?.wins ?? 0,
        draws: pr?.draws ?? 0,
        losses: pr?.losses ?? 0,
        peak: pr?.peakRating ?? start,
        lowest: pr?.lowestRating ?? start,
      });
    }

    const history: RatingHistoryRow[] = [];
    const now = new Date().toISOString();
    const applyStat = (pid: string, outcome: 'win' | 'draw' | 'loss', newRating: number) => {
      const s = stat.get(pid)!;
      s.games += 1;
      if (outcome === 'win') s.wins += 1;
      else if (outcome === 'draw') s.draws += 1;
      else s.losses += 1;
      s.peak = Math.max(s.peak, newRating);
      s.lowest = Math.min(s.lowest, newRating);
    };

    for (const m of rated) {
      const res = m.result as { kind: string; winner?: string };
      const rA = ratingMap.get(m.playerAId)!;
      const rB = ratingMap.get(m.playerBId)!;
      const kA = calculateKFactor(rA, config);
      const kB = calculateKFactor(rB, config);
      const outA: 'win' | 'draw' | 'loss' = res.kind === 'draw' ? 'draw' : res.winner === 'A' ? 'win' : 'loss';
      const outB: 'win' | 'draw' | 'loss' = outA === 'win' ? 'loss' : outA === 'loss' ? 'win' : 'draw';
      const nA = clampRating(rA + calculateEloChange({ playerRating: rA, opponentRating: rB, matchResult: outA, kFactor: kA }), config);
      const nB = clampRating(rB + calculateEloChange({ playerRating: rB, opponentRating: rA, matchResult: outB, kFactor: kB }), config);
      ratingMap.set(m.playerAId, nA);
      ratingMap.set(m.playerBId, nB);
      applyStat(m.playerAId, outA, nA);
      applyStat(m.playerBId, outB, nB);
      history.push(
        { id: '', playerId: m.playerAId, gameKey, matchId: m.id, tournamentId: t.id, ratingBefore: rA, ratingAfter: nA, ratingChange: nA - rA, kFactorUsed: kA, opponentRating: rB, matchResult: outA, calculatedAt: now },
        { id: '', playerId: m.playerBId, gameKey, matchId: m.id, tournamentId: t.id, ratingBefore: rB, ratingAfter: nB, ratingChange: nB - rB, kFactorUsed: kB, opponentRating: rA, matchResult: outB, calculatedAt: now }
      );
    }

    await data.ratings.appendHistory(history);
    for (const pid of playerIds) {
      const s = stat.get(pid)!;
      await data.ratings.upsertPlayerRating({
        playerId: pid,
        gameKey,
        currentRating: ratingMap.get(pid)!,
        peakRating: s.peak,
        lowestRating: s.lowest,
        gamesPlayed: s.games,
        wins: s.wins,
        draws: s.draws,
        losses: s.losses,
      });
    }
    await data.ratings.updateJob(job.id, { status: 'completed', matchesProcessed: rated.length, playersAffected: playerIds.length });
    return { matchesProcessed: rated.length, playersAffected: playerIds.length };
  } catch (e: any) {
    await data.ratings.updateJob(job.id, { status: 'failed', errorMessage: e?.message ?? String(e) });
    throw e;
  }
}

// 觸發計算（主辦管理者）。同賽事已計算過回 409（MVP 不支援重算）。
app.post('/api/tournaments/:id/calculate-ratings', async (req, reply) => {
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  const data = getData();
  const t = await data.tournaments.get(id);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!(await hasTournamentManageAccess(data, caller, t.id))) return reply.code(403).send({ code: 'FORBIDDEN' });
  const done = await data.ratings.findCompletedJob(t.id, t.gameKey);
  if (done) return reply.code(409).send({ code: 'ALREADY_RATED', message: '此賽事已計算過等級分（MVP 不支援重算）。' });
  const result = await computeTournamentRatings(data, t, caller.userId);
  return result;
});

// 公開：等級分排行榜
app.get('/api/ratings/:gameKey/leaderboard', async (req, reply) => {
  const gameKey = (req.params as any).gameKey as string;
  if (!['go', 'chess', 'xiangqi', 'gomoku'].includes(gameKey)) return reply.code(400).send({ code: 'INVALID_GAME_KEY' });
  const q = req.query as { limit?: string; offset?: string };
  const limit = q.limit != null ? Math.min(200, Math.max(1, parseInt(q.limit, 10) || 100)) : 100;
  const offset = q.offset != null ? Math.max(0, parseInt(q.offset, 10) || 0) : 0;
  const data = getData();
  return data.ratings.leaderboard(gameKey, limit, offset);
});

// 公開：單一棋手某棋種的等級分與變化歷史
app.get('/api/players/:id/ratings/:gameKey', async (req, reply) => {
  const playerId = (req.params as any).id as string;
  const gameKey = (req.params as any).gameKey as string;
  if (!['go', 'chess', 'xiangqi', 'gomoku'].includes(gameKey)) return reply.code(400).send({ code: 'INVALID_GAME_KEY' });
  const data = getData();
  const [rating] = await data.ratings.getPlayerRatings([playerId], gameKey);
  const history = await data.ratings.listHistory(playerId, gameKey, 50);
  return { rating: rating ?? null, history };
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

// 公開：官方成績（匯入賽事的原始名次/輔分/升段 + 每組各輪對局）
// - 無 categoryKey：回傳組別清單（含每組人數）
// - 有 categoryKey：回傳該組官方名次表 + 對局清單（以代碼/編號呈現）
app.get('/api/public/tournaments/:tournamentId/official-results', async (req, reply) => {
  const tournamentId = (req.params as any).tournamentId as string;
  const data = getData();
  const t = await data.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  const allowedStatuses = ['published', 'checkin_open', 'pairing_ready', 'in_progress', 'closed', 'cancelled'];
  if (!allowedStatuses.includes(t.status)) return reply.code(404).send({ code: 'NOT_FOUND' });
  const pool = getPool();
  if (!pool) return reply.code(501).send({ code: 'DB_REQUIRED', message: '此功能需連線資料庫。' });

  const cats = await data.tournamentCategories.listByTournamentId(tournamentId);
  const counts = await pool.query(
    `select category_key, count(*)::int n from tournament_official_results where tournament_id=$1 group by category_key`,
    [tournamentId]
  );
  const countMap = new Map<string, number>(counts.rows.map((r: any) => [r.category_key, r.n]));
  const categories = cats
    .map((c) => ({ key: c.key, displayName: c.displayName, sortOrder: c.sortOrder, players: countMap.get(c.key) ?? 0 }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const filter = normalizeGroupKey((req.query as any)?.categoryKey);
  if (!filter) return { tournament: { id: t.id, name: t.name, gameKey: t.gameKey, status: t.status }, categories };
  if (!categories.some((c) => c.key === filter)) return reply.code(404).send({ code: 'CATEGORY_NOT_FOUND' });

  const resultsQ = await pool.query(
    `select seed_no, anon_code, final_rank, tiebreak1, tiebreak2, tiebreak3, tiebreak4, wins, is_playoff, promoted_to
       from tournament_official_results
      where tournament_id=$1 and category_key=$2
      order by final_rank nulls last, seed_no`,
    [tournamentId, filter]
  );
  const results = resultsQ.rows.map((r: any) => ({
    seedNo: r.seed_no,
    code: r.anon_code,
    rank: r.final_rank,
    tiebreaks: [r.tiebreak1, r.tiebreak2, r.tiebreak3, r.tiebreak4].map((v) => (v == null ? null : Number(v))),
    wins: r.wins,
    isPlayoff: r.is_playoff,
    promotedTo: r.promoted_to,
  }));

  const matchesQ = await pool.query(
    `select m.round_no,
            ora.seed_no a_seed, ora.anon_code a_code,
            orb.seed_no b_seed, orb.anon_code b_code,
            m.result
       from matches m
       join registrations ra on ra.tournament_id=m.tournament_id and ra.user_id=m.player_a_id
       join registrations rb on rb.tournament_id=m.tournament_id and rb.user_id=m.player_b_id
       join tournament_official_results ora on ora.registration_id=ra.id
       join tournament_official_results orb on orb.registration_id=rb.id
      where m.tournament_id=$1 and m.category_key=$2
      order by m.round_no, ora.seed_no`,
    [tournamentId, filter]
  );
  const matches = matchesQ.rows.map((m: any) => {
    const winner = (m.result && (m.result as any).kind === 'win') ? (m.result as any).winner : null;
    return {
      roundNo: m.round_no,
      a: { seedNo: m.a_seed, code: m.a_code },
      b: { seedNo: m.b_seed, code: m.b_code },
      winnerSeed: winner === 'A' ? m.a_seed : winner === 'B' ? m.b_seed : null,
    };
  });

  return { tournament: { id: t.id, name: t.name }, categoryKey: filter, results, matches };
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

// 開發／E2E：尚無 platform_admin 時，允許目前登入者自封為總管（需 OTC_ALLOW_DEV_BOOTSTRAP=1）
app.post('/api/dev/promote-platform-admin', async (req, reply) => {
  if (process.env.OTC_ALLOW_DEV_BOOTSTRAP !== '1') {
    return reply.code(404).send({ code: 'NOT_FOUND' });
  }
  const caller = await requireCaller(req, reply);
  if (!caller) return;
  const data = getData();
  await data.ensureUser(caller.userId);
  const { items } = await data.users.list({ limit: 500 });
  if (items.some((u) => u.platformRole === 'platform_admin')) {
    return reply.code(409).send({ code: 'ALREADY_HAS_ADMIN', message: '已有平台總管' });
  }
  const updated = await data.users.update(caller.userId, { platformRole: 'platform_admin' });
  if (!updated) return reply.code(404).send({ code: 'NOT_FOUND' });
  return serializeUser(updated, { admin: true });
});

const port = Number(process.env.PORT ?? 3875);
const host = process.env.HOST ?? '::';

app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});


