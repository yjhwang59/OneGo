import Fastify from 'fastify';
import { Type } from '@sinclair/typebox';

import { canCheckIn, canGeneratePairing, canRegister, canSubmitResult, canTransitionTournament, computePublicPoints, computeStandings, intervalsOverlap } from '@otc/core';
import { dbHealth } from './db';
import { getCaller, hasOrgAccess, hasOrgManageAccess, hasTournamentManageAccess } from './rbac';
import { getRulesPlugin } from './rules';
import type { Match, Payment, Registration } from './store';
import { store } from './store';

const app = Fastify({ logger: true });

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

function requireCaller(req: any, reply: any) {
  const caller = getCaller(req.headers as any);
  if (!caller) {
    reply.code(401).send({ code: 'UNAUTHENTICATED', message: '需要提供 x-user-id 以模擬登入（MVP）' });
    return null;
  }
  store.ensureUser(caller.userId);
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
    const caller = requireCaller(req, reply);
    if (!caller) return;
    const id = store.newId();
    const now = store.nowIso();
    const org = { id, name: (req.body as any).name, slug: (req.body as any).slug, createdAt: now };
    store.organizations.set(org.id, org);
    const memberId = store.newId();
    store.orgMemberships.set(memberId, {
      id: memberId,
      organizationId: org.id,
      userId: caller.userId,
      role: 'owner',
      createdAt: now
    });
    return reply.code(201).send(org);
  }
);

app.get('/api/organizations', async (req) => {
  const caller = getCaller(req.headers as any);
  if (!caller) return [];
  store.ensureUser(caller.userId);
  const orgIds = new Set<string>();
  for (const m of store.orgMemberships.values()) {
    if (m.userId === caller.userId) orgIds.add(m.organizationId);
  }
  return [...store.organizations.values()].filter((o) => orgIds.has(o.id));
});

app.get('/api/organizations/:id', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const orgId = (req.params as any).id as string;
  if (!hasOrgAccess(store, caller, orgId)) return reply.code(403).send({ code: 'FORBIDDEN' });
  const org = store.organizations.get(orgId);
  if (!org) return reply.code(404).send({ code: 'NOT_FOUND' });
  return org;
});

app.get('/api/organizations/:id/members', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const orgId = (req.params as any).id as string;
  if (!hasOrgManageAccess(store, caller, orgId)) return reply.code(403).send({ code: 'FORBIDDEN' });
  return [...store.orgMemberships.values()].filter((m) => m.organizationId === orgId);
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
    const caller = requireCaller(req, reply);
    if (!caller) return;
    const orgId = (req.params as any).id as string;
    if (!hasOrgManageAccess(store, caller, orgId)) return reply.code(403).send({ code: 'FORBIDDEN' });
    const body = req.body as any;
    store.ensureUser(body.userId);
    for (const m of store.orgMemberships.values()) {
      if (m.organizationId === orgId && m.userId === body.userId) return reply.code(409).send({ code: 'ALREADY_MEMBER' });
    }
    const id = store.newId();
    const now = store.nowIso();
    const member = { id, organizationId: orgId, userId: body.userId, role: body.role, createdAt: now } as const;
    store.orgMemberships.set(id, member);
    return reply.code(201).send(member);
  }
);

// ===== Public tournaments（半公開：不需要是主辦成員也可查）=====
app.get('/api/public/tournaments', async (req) => {
  const q = req.query as any;
  return [...store.tournaments.values()].filter((t) => {
    if (t.status !== 'published' && t.status !== 'checkin_open' && t.status !== 'pairing_ready' && t.status !== 'in_progress' && t.status !== 'closed')
      return false;
    if (q.status && t.status !== q.status) return false;
    if (q.gameKey && t.gameKey !== q.gameKey) return false;
    return true;
  });
});

app.get('/api/public/tournaments/:id', async (req, reply) => {
  const id = (req.params as any).id as string;
  const t = store.tournaments.get(id);
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
    const caller = requireCaller(req, reply);
    if (!caller) return;
    const body = req.body as any;
    if (!hasOrgManageAccess(store, caller, body.organizationId)) return reply.code(403).send({ code: 'FORBIDDEN' });
    const rules = getRulesPlugin({ gameKey: body.gameKey, rulesetVersion: body.rulesetVersion ?? 'v1' });
    if (!rules) return reply.code(400).send({ code: 'UNSUPPORTED_RULESET' });
    const id = store.newId();
    const now = store.nowIso();
    const t = {
      id,
      organizationId: body.organizationId,
      name: body.name,
      gameKey: body.gameKey,
      rulesetVersion: body.rulesetVersion ?? 'v1',
      timezone: body.timezone ?? 'UTC',
      format: body.format,
      roundCount: body.roundCount,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      status: 'draft',
      createdAt: now,
      updatedAt: now
    } as const;
    store.tournaments.set(t.id, t);
    return reply.code(201).send(t);
  }
);

app.get('/api/tournaments/:id', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  const t = store.tournaments.get(id);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!hasOrgAccess(store, caller, t.organizationId)) return reply.code(403).send({ code: 'FORBIDDEN' });
  return t;
});

app.get('/api/tournaments', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const q = req.query as any;
  const allowedOrgIds = new Set<string>();
  for (const m of store.orgMemberships.values()) if (m.userId === caller.userId) allowedOrgIds.add(m.organizationId);
  return [...store.tournaments.values()].filter((t) => {
    if (!allowedOrgIds.has(t.organizationId)) return false;
    if (q.organizationId && t.organizationId !== q.organizationId) return false;
    if (q.status && t.status !== q.status) return false;
    if (q.gameKey && t.gameKey !== q.gameKey) return false;
    return true;
  });
});

async function transitionTournament(tournamentId: string, next: any, req: any, reply: any) {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const t = store.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!hasTournamentManageAccess(store, caller, t.id)) return reply.code(403).send({ code: 'FORBIDDEN' });
  const guard = canTransitionTournament(t.status as any, next);
  if (!guard.ok) return reply.code(409).send({ code: guard.code, message: guard.message });
  const updated = { ...t, status: next, updatedAt: store.nowIso() };
  store.tournaments.set(t.id, updated);
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
    const caller = requireCaller(req, reply);
    if (!caller) return;
    const tournamentId = (req.params as any).tournamentId as string;
    const t = store.tournaments.get(tournamentId);
    if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
    const guard = canRegister(t.status as any);
    if (!guard.ok) return reply.code(409).send({ code: guard.code, message: guard.message });
    const body = req.body as any;
    // 參賽者自助報名：允許 caller.userId == body.userId；主辦則可代報名
    const isSelf = caller.userId === body.userId;
    const isOrg = hasOrgAccess(store, caller, t.organizationId);
    if (!isSelf && !isOrg) return reply.code(403).send({ code: 'FORBIDDEN' });
    store.ensureUser(body.userId);
    for (const r of store.registrations.values()) {
      if (r.tournamentId === tournamentId && r.userId === body.userId) return reply.code(409).send({ code: 'ALREADY_REGISTERED' });
    }
    const id = store.newId();
    const now = store.nowIso();
    const r = {
      id,
      tournamentId,
      userId: body.userId,
      status: 'created',
      categoryKey: body.categoryKey,
      createdAt: now,
      updatedAt: now
    } as const;
    store.registrations.set(r.id, r);
    return reply.code(201).send(r);
  }
);

app.get('/api/tournaments/:tournamentId/registrations', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const tournamentId = (req.params as any).tournamentId as string;
  const t = store.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!hasOrgAccess(store, caller, t.organizationId)) return reply.code(403).send({ code: 'FORBIDDEN' });
  return [...store.registrations.values()].filter((r) => r.tournamentId === tournamentId);
});

app.get('/api/me/registrations', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  return [...store.registrations.values()].filter((r) => r.userId === caller.userId);
});

app.post('/api/registrations/:id/events/cancel', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  const r = store.registrations.get(id);
  if (!r) return reply.code(404).send({ code: 'NOT_FOUND' });
  const t = store.tournaments.get(r.tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  // 參賽者可取消自己的報名；主辦也可取消
  if (caller.userId !== r.userId && !hasOrgAccess(store, caller, t.organizationId)) return reply.code(403).send({ code: 'FORBIDDEN' });
  const updated: Registration = { ...r, status: 'cancelled', updatedAt: store.nowIso() };
  store.registrations.set(r.id, updated);
  return updated;
});

// ===== Payments (Mock) =====
app.post(
  '/api/registrations/:registrationId/payments',
  { schema: { body: Type.Object({ amountCents: Type.Number({ minimum: 0 }), currency: Type.Optional(Type.String()) }) } },
  async (req, reply) => {
    const caller = requireCaller(req, reply);
    if (!caller) return;
    const registrationId = (req.params as any).registrationId as string;
    const r = store.registrations.get(registrationId);
    if (!r) return reply.code(404).send({ code: 'NOT_FOUND' });
    const t = store.tournaments.get(r.tournamentId);
    if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
    // 參賽者可為自己付款；主辦也可代操作
    if (caller.userId !== r.userId && !hasOrgAccess(store, caller, t.organizationId)) return reply.code(403).send({ code: 'FORBIDDEN' });
    const body = req.body as any;
    const id = store.newId();
    const now = store.nowIso();
    const p = {
      id,
      registrationId,
      status: 'initiated',
      providerKey: 'mock',
      amountCents: body.amountCents,
      currency: body.currency ?? 'TWD',
      createdAt: now,
      updatedAt: now
    } as const;
    store.payments.set(p.id, p);
    return reply.code(201).send(p);
  }
);

app.post('/api/payments/:id/events/mark-succeeded', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  const p = store.payments.get(id);
  if (!p) return reply.code(404).send({ code: 'NOT_FOUND' });
  const r = store.registrations.get(p.registrationId);
  if (!r) return reply.code(404).send({ code: 'NOT_FOUND' });
  const t = store.tournaments.get(r.tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!hasTournamentManageAccess(store, caller, t.id)) return reply.code(403).send({ code: 'FORBIDDEN' });
  const updated: Payment = { ...p, status: 'succeeded', updatedAt: store.nowIso() };
  store.payments.set(id, updated);
  store.registrations.set(r.id, { ...r, status: 'paid', updatedAt: store.nowIso() });
  return updated;
});

app.post('/api/payments/:id/events/mark-failed', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  const p = store.payments.get(id);
  if (!p) return reply.code(404).send({ code: 'NOT_FOUND' });
  const r = store.registrations.get(p.registrationId);
  if (!r) return reply.code(404).send({ code: 'NOT_FOUND' });
  const t = store.tournaments.get(r.tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!hasTournamentManageAccess(store, caller, t.id)) return reply.code(403).send({ code: 'FORBIDDEN' });
  const updated: Payment = { ...p, status: 'failed', updatedAt: store.nowIso() };
  store.payments.set(id, updated);
  return updated;
});

// ===== Check-in =====
app.post('/api/registrations/:registrationId/checkin/events/check-in', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const registrationId = (req.params as any).registrationId as string;
  const r = store.registrations.get(registrationId);
  if (!r) return reply.code(404).send({ code: 'NOT_FOUND' });
  const t = store.tournaments.get(r.tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!hasTournamentManageAccess(store, caller, t.id)) return reply.code(403).send({ code: 'FORBIDDEN' });
  const guard = canCheckIn(t.status as any);
  if (!guard.ok) return reply.code(409).send({ code: guard.code, message: guard.message });
  const now = store.nowIso();
  // upsert
  let c = [...store.checkins.values()].find((x) => x.registrationId === registrationId);
  if (!c) {
    c = { id: store.newId(), registrationId, status: 'checked_in', checkedInAt: now, createdAt: now, updatedAt: now };
  } else {
    c = { ...c, status: 'checked_in', checkedInAt: now, updatedAt: now };
  }
  store.checkins.set(c.id, c);
  return c;
});

app.post('/api/registrations/:registrationId/checkin/events/withdraw', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const registrationId = (req.params as any).registrationId as string;
  const r = store.registrations.get(registrationId);
  if (!r) return reply.code(404).send({ code: 'NOT_FOUND' });
  const t = store.tournaments.get(r.tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!hasTournamentManageAccess(store, caller, t.id)) return reply.code(403).send({ code: 'FORBIDDEN' });
  const guard = canCheckIn(t.status as any);
  if (!guard.ok) return reply.code(409).send({ code: guard.code, message: guard.message });
  const now = store.nowIso();
  let c = [...store.checkins.values()].find((x) => x.registrationId === registrationId);
  if (!c) c = { id: store.newId(), registrationId, status: 'withdrawn', createdAt: now, updatedAt: now };
  else c = { ...c, status: 'withdrawn', updatedAt: now };
  store.checkins.set(c.id, c);
  return c;
});

// ===== Pairing =====
app.post(
  '/api/tournaments/:tournamentId/pairings/events/generate-round',
  { schema: { body: Type.Object({ roundNo: Type.Number({ minimum: 1 }) }) } },
  async (req, reply) => {
    const caller = requireCaller(req, reply);
    if (!caller) return;
    const tournamentId = (req.params as any).tournamentId as string;
    const t = store.tournaments.get(tournamentId);
    if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
    if (!hasTournamentManageAccess(store, caller, t.id)) return reply.code(403).send({ code: 'FORBIDDEN' });
    const guard = canGeneratePairing(t.status as any);
    if (!guard.ok) return reply.code(409).send({ code: guard.code, message: guard.message });

    const roundNo = (req.body as any).roundNo as number;
    const regs = [...store.registrations.values()].filter((r) => r.tournamentId === tournamentId && r.status !== 'cancelled');
    const checkedIn = new Set<string>();
    for (const c of store.checkins.values()) {
      if (c.status === 'checked_in') checkedIn.add(c.registrationId);
    }
    const participants = regs.filter((r) => checkedIn.has(r.id)).map((r) => r.userId);

    // MVP：簡易配對（依加入順序兩兩配），奇數最後一位先不配（視為 bye，後續可擴充）
    const created: any[] = [];
    for (let i = 0; i + 1 < participants.length; i += 2) {
      const a = participants[i]!;
      const b = participants[i + 1]!;
      const id = store.newId();
      const now = store.nowIso();
      const m = {
        id,
        tournamentId,
        roundNo,
        tableNo: created.length + 1,
        playerAId: a,
        playerBId: b,
        status: 'scheduled',
        createdAt: now,
        updatedAt: now
      } as const;
      store.matches.set(m.id, m);
      created.push(m);
    }
    return reply.code(201).send(created);
  }
);

// ===== Matches / Result =====
app.get('/api/tournaments/:tournamentId/matches', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const tournamentId = (req.params as any).tournamentId as string;
  const t = store.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!hasOrgAccess(store, caller, t.organizationId)) return reply.code(403).send({ code: 'FORBIDDEN' });
  const q = req.query as any;
  return [...store.matches.values()].filter((m) => {
    if (m.tournamentId !== tournamentId) return false;
    if (q.roundNo && Number(q.roundNo) !== m.roundNo) return false;
    return true;
  });
});

app.get('/api/me/tournaments/:tournamentId/matches', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const tournamentId = (req.params as any).tournamentId as string;
  return [...store.matches.values()].filter((m) => m.tournamentId === tournamentId && (m.playerAId === caller.userId || m.playerBId === caller.userId));
});

app.post('/api/matches/:id/result', { schema: { body: Type.Object({ result: Type.Any() }) } }, async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const id = (req.params as any).id as string;
  const m = store.matches.get(id);
  if (!m) return reply.code(404).send({ code: 'NOT_FOUND' });
  const t = store.tournaments.get(m.tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!hasTournamentManageAccess(store, caller, t.id)) return reply.code(403).send({ code: 'FORBIDDEN' });
  const guard = canSubmitResult(t.status as any);
  if (!guard.ok) return reply.code(409).send({ code: guard.code, message: guard.message });
  const rules = getRulesPlugin({ gameKey: t.gameKey, rulesetVersion: t.rulesetVersion });
  if (!rules) return reply.code(400).send({ code: 'UNSUPPORTED_RULESET' });
  const normalized = rules.normalizeMatchResult((req.body as any).result);
  if (!normalized.ok) return reply.code(400).send({ code: normalized.error.code, message: normalized.error.message });
  const now = store.nowIso();
  const updated: Match = { ...m, status: 'finished', result: normalized.result, updatedAt: now, finishedAt: now };
  store.matches.set(m.id, updated);
  return updated;
});

// ===== Standings =====
app.get('/api/tournaments/:tournamentId/standings', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const tournamentId = (req.params as any).tournamentId as string;
  const t = store.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!hasOrgAccess(store, caller, t.organizationId)) return reply.code(403).send({ code: 'FORBIDDEN' });
  const rules = getRulesPlugin({ gameKey: t.gameKey, rulesetVersion: t.rulesetVersion });
  if (!rules) return reply.code(400).send({ code: 'UNSUPPORTED_RULESET' });

  // participants: checked-in registrations
  const regs = [...store.registrations.values()].filter((r) => r.tournamentId === tournamentId && r.status !== 'cancelled');
  const checkedIn = new Set<string>();
  for (const c of store.checkins.values()) if (c.status === 'checked_in') checkedIn.add(c.registrationId);
  const participants = regs.filter((r) => checkedIn.has(r.id)).map((r) => r.userId);

  const matches = [...store.matches.values()]
    .filter((m) => m.tournamentId === tournamentId && m.status === 'finished' && m.result)
    .map((m) => ({ playerAId: m.playerAId, playerBId: m.playerBId, result: m.result! }));
  return computeStandings({ participants, matches, rules });
});

app.get('/api/public/tournaments/:tournamentId/standings', async (req, reply) => {
  const tournamentId = (req.params as any).tournamentId as string;
  const t = store.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  const rules = getRulesPlugin({ gameKey: t.gameKey, rulesetVersion: t.rulesetVersion });
  if (!rules) return reply.code(400).send({ code: 'UNSUPPORTED_RULESET' });
  const matches = [...store.matches.values()]
    .filter((m) => m.tournamentId === tournamentId && m.status === 'finished' && m.result)
    .map((m) => ({ playerAId: m.playerAId, playerBId: m.playerBId, result: m.result! }));
  return computePublicPoints({ matches, rules });
});

// ===== Tournament Roles（裁判/工作人員指派 + 時間衝突檢查）=====
app.get('/api/tournaments/:tournamentId/roles', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const tournamentId = (req.params as any).tournamentId as string;
  const t = store.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!hasTournamentManageAccess(store, caller, t.id)) return reply.code(403).send({ code: 'FORBIDDEN' });
  return [...store.tournamentRoles.values()].filter((r) => r.tournamentId === tournamentId);
});

app.post(
  '/api/tournaments/:tournamentId/roles',
  { schema: { body: Type.Object({ userId: Type.String({ minLength: 1 }), role: Type.Union([Type.Literal('referee'), Type.Literal('staff'), Type.Literal('organizer')]) }) } },
  async (req, reply) => {
    const caller = requireCaller(req, reply);
    if (!caller) return;
    const tournamentId = (req.params as any).tournamentId as string;
    const t = store.tournaments.get(tournamentId);
    if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
    if (!hasTournamentManageAccess(store, caller, t.id)) return reply.code(403).send({ code: 'FORBIDDEN' });

    const body = req.body as any;
    store.ensureUser(body.userId);

    // 既有重複指派
    for (const r of store.tournamentRoles.values()) {
      if (r.tournamentId === tournamentId && r.userId === body.userId && r.role === body.role) {
        return reply.code(409).send({ code: 'ALREADY_ASSIGNED' });
      }
    }

    // 時間衝突檢查：同一 user 在其他 tournaments 的 referee/staff 指派不得與本賽事重疊
    if (body.role === 'referee' || body.role === 'staff') {
      for (const r of store.tournamentRoles.values()) {
        if (r.userId !== body.userId) continue;
        if (r.role !== 'referee' && r.role !== 'staff') continue;
        const other = store.tournaments.get(r.tournamentId);
        if (!other) continue;
        if (intervalsOverlap(t.startsAt, t.endsAt, other.startsAt, other.endsAt)) {
          return reply.code(409).send({ code: 'SCHEDULE_CONFLICT' });
        }
      }
    }

    const id = store.newId();
    const now = store.nowIso();
    const tr = { id, tournamentId, userId: body.userId, role: body.role, createdAt: now } as const;
    store.tournamentRoles.set(tr.id, tr);
    return reply.code(201).send(tr);
  }
);

app.delete('/api/tournaments/:tournamentId/roles/:roleId', async (req, reply) => {
  const caller = requireCaller(req, reply);
  if (!caller) return;
  const tournamentId = (req.params as any).tournamentId as string;
  const roleId = (req.params as any).roleId as string;
  const t = store.tournaments.get(tournamentId);
  if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
  if (!hasTournamentManageAccess(store, caller, t.id)) return reply.code(403).send({ code: 'FORBIDDEN' });
  const existing = store.tournamentRoles.get(roleId);
  if (!existing || existing.tournamentId !== tournamentId) return reply.code(404).send({ code: 'NOT_FOUND' });
  store.tournamentRoles.delete(roleId);
  return reply.code(204).send();
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '::';

app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});


