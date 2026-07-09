#!/usr/bin/env node
/**
 * 擬真場景種子：三層角色 + 台灣風格主辦／棋友姓名 + 多狀態賽事。
 * 說明文件：docs/15-roles-usecases-and-test-data.md
 *
 * 前置：npm run dev:api
 * 執行：npm run seed:realistic
 * 環境變數：OTC_API_BASE（預設 http://127.0.0.1:3875）
 */

import process from 'node:process';
import pg from 'pg';
import { resolveDatabaseUrl } from './resolve-db-url.mjs';

const BASE = process.env.OTC_API_BASE || process.env.NEXT_PUBLIC_OTC_API_BASE || 'http://127.0.0.1:3875';

const PA = { id: 'pa-lin', name: '林營運' };

const ORGS = [
  {
    slug: 'taipei-gocafe',
    name: '台北 GoCafe',
    owner: { id: 'gc-chen', name: '陳館長' },
    members: [
      { id: 'gc-wang', name: '王賽務', role: 'admin' },
      { id: 'gc-hsu', name: '許志工', role: 'staff' },
    ],
    referee: { id: 'gc-ref-liu', name: '劉裁判' },
  },
  {
    slug: 'ntu-weiqi',
    name: '台大圍棋社',
    owner: { id: 'ntu-wu', name: '吳社長' },
    members: [{ id: 'ntu-chang', name: '張副社', role: 'admin' }],
  },
  {
    slug: 'tpe-qiyuan',
    name: '台北棋院',
    owner: { id: 'qy-huang', name: '黃院長' },
    members: [{ id: 'qy-chou', name: '周教練', role: 'admin' }],
  },
];

const PLAYERS = [
  { id: 'pl-yang', name: '楊子軒' },
  { id: 'pl-lin', name: '林品妤' },
  { id: 'pl-chen', name: '陳柏宇' },
  { id: 'pl-wu', name: '吳宜臻' },
  { id: 'pl-hsieh', name: '謝承恩' },
  { id: 'pl-tsai', name: '蔡宜庭' },
  { id: 'pl-cheng', name: '鄭浩宇' },
  { id: 'pl-huang', name: '黃詩涵' },
  { id: 'pl-liu', name: '劉冠廷' },
  { id: 'pl-chang', name: '張雅筑' },
  { id: 'pl-hsu', name: '許哲維' },
  { id: 'pl-chou', name: '周子晴' },
  { id: 'pl-kuo', name: '郭俊傑' },
  { id: 'pl-pan', name: '潘心怡' },
  { id: 'pl-fang', name: '方立安' },
  { id: 'pl-shih', name: '施雨萱' },
];

function headers(userId) {
  return { 'Content-Type': 'application/json', 'x-user-id': userId };
}

async function req(method, path, userId, body) {
  const bodyStr =
    body !== undefined
      ? JSON.stringify(body)
      : method === 'POST' || method === 'PATCH'
        ? '{}'
        : undefined;
  const h = { 'x-user-id': userId };
  if (bodyStr !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers: h, body: bodyStr });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* 204 */
  }
  return { status: res.status, data };
}

async function waitHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        console.log('API health OK', data.db?.enabled ? '(DB)' : '(InMemory)');
        return data;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('API health check timeout — 請先 npm run dev:api');
}

async function ensureUser(userId) {
  const r = await req('GET', '/api/me', userId);
  if (r.status !== 200) throw new Error(`ensureUser ${userId}: ${r.status}`);
  return r.data;
}

async function upsertUserAsAdmin(u, platformRole = null) {
  const created = await req('POST', '/api/platform/users', PA.id, {
    id: u.id,
    displayName: u.name,
    platformRole,
  });
  if (created.status === 201) return;
  if (created.status === 409) {
    await req('PATCH', `/api/platform/users/${encodeURIComponent(u.id)}`, PA.id, {
      displayName: u.name,
      ...(platformRole !== undefined ? { platformRole } : {}),
    });
    return;
  }
  // 無平台權限時退回 ensure + PATCH /me
  await ensureUser(u.id);
  await req('PATCH', '/api/me', u.id, { displayName: u.name });
}

async function grantPlatformAdmin(userId, displayName) {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    console.warn(`無 DATABASE_URL，略過平台總管授權。可執行：npm run grant:admin -- ${userId}`);
    return false;
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query(
      "UPDATE users SET platform_role='platform_admin', display_name=$2, updated_at=now() WHERE id=$1",
      [userId, displayName]
    );
  } finally {
    await client.end().catch(() => {});
  }
  console.log(`已授予 ${userId}（${displayName}）平台總管`);
  return true;
}

async function ensureOrg(ownerId, name, slug) {
  const list = await req('GET', '/api/organizations', ownerId);
  const existing = (list.data ?? []).find?.((o) => o.slug === slug);
  if (existing) return existing;
  const created = await req('POST', '/api/organizations', ownerId, { name, slug });
  if (created.status !== 201 && created.status !== 200) {
    throw new Error(`createOrg ${name}: ${created.status} ${JSON.stringify(created.data)}`);
  }
  return created.data;
}

async function ensureMember(ownerId, orgId, userId, role) {
  const members = (await req('GET', `/api/organizations/${orgId}/members`, ownerId)).data ?? [];
  const existing = members.find((m) => m.userId === userId);
  if (existing) {
    if (existing.role !== role) {
      await req('POST', `/api/organizations/${orgId}/members/${existing.id}/events/change-role`, ownerId, {
        role,
      });
    }
    return;
  }
  const r = await req('POST', `/api/organizations/${orgId}/members`, ownerId, { userId, role });
  if (r.status !== 201 && r.status !== 200 && r.status !== 409) {
    throw new Error(`addMember ${userId}: ${r.status} ${JSON.stringify(r.data)}`);
  }
}

async function ensureTournament(adminId, body) {
  const list = (await req('GET', '/api/tournaments', adminId)).data ?? [];
  const existing = list.find?.((t) => t.name === body.name && t.organizationId === body.organizationId);
  if (existing) return existing;
  const created = await req('POST', '/api/tournaments', adminId, body);
  if (created.status !== 201 && created.status !== 200) {
    throw new Error(`createTournament ${body.name}: ${created.status} ${JSON.stringify(created.data)}`);
  }
  return created.data;
}

async function transition(adminId, tournamentId, event) {
  return req('POST', `/api/tournaments/${tournamentId}/events/${event}`, adminId);
}

async function register(userId, tournamentId, categoryKey) {
  const body = categoryKey ? { userId, categoryKey } : { userId };
  const r = await req('POST', `/api/tournaments/${tournamentId}/registrations`, userId, body);
  if (r.status === 200 || r.status === 201) return r.data;
  if (r.data?.code === 'ALREADY_REGISTERED') return { skipped: true };
  throw new Error(`register ${userId}: ${r.status} ${JSON.stringify(r.data)}`);
}

/** 重跑種子時補齊／修正報名組別（避免舊資料 categoryKey 為 null） */
async function fixRegistrationCategoryKeyDb(tournamentId, userId, categoryKey) {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) return false;
  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const r = await client.query(
      'UPDATE registrations SET category_key = $1, updated_at = now() WHERE tournament_id = $2 AND user_id = $3 AND (category_key IS NULL OR category_key <> $1)',
      [categoryKey, tournamentId, userId]
    );
    return (r.rowCount ?? 0) > 0;
  } finally {
    await client.end().catch(() => {});
  }
}

/** 舊對局缺 category_key 時，依選手報名組別回填（種子重跑 idempotent） */
async function backfillMatchCategoryKeysDb(tournamentId) {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) return 0;
  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const r = await client.query(
      `UPDATE matches m
       SET category_key = r.category_key, updated_at = now()
       FROM registrations r
       WHERE m.tournament_id = $1
         AND r.tournament_id = $1
         AND r.user_id = m.player_a_id
         AND r.status <> 'cancelled'
         AND r.category_key IS NOT NULL
         AND (m.category_key IS NULL OR m.category_key = '')`,
      [tournamentId]
    );
    return r.rowCount ?? 0;
  } finally {
    await client.end().catch(() => {});
  }
}

async function ensureEntryRegistrations(adminId, tournamentId, entries, tournamentStatus) {
  if (!entries?.length) return;
  const regs = await listRegs(adminId, tournamentId);
  const byUser = new Map(regs.map((r) => [r.userId, r]));
  for (const e of entries) {
    const want = e.categoryKey ?? null;
    const existing = byUser.get(e.userId);
    if (!existing) {
      if (tournamentStatus === 'published' || tournamentStatus === 'checkin_open') {
        await register(e.userId, tournamentId, want);
      }
      continue;
    }
    if (!want || existing.categoryKey === want) continue;
    if (tournamentStatus === 'published' || tournamentStatus === 'checkin_open') {
      const r = await req('POST', `/api/registrations/${existing.id}/events/change-category`, adminId, {
        categoryKey: want,
      });
      if (r.status !== 200 && r.status !== 201) {
        throw new Error(`change-category ${e.userId}: ${r.status} ${JSON.stringify(r.data)}`);
      }
    } else if (tournamentStatus === 'in_progress' || tournamentStatus === 'pairing_ready') {
      await fixRegistrationCategoryKeyDb(tournamentId, e.userId, want);
    }
  }
}

async function ensureCategory(adminId, tournamentId, key, displayName) {
  const list = (await req('GET', `/api/tournaments/${tournamentId}/categories`, adminId)).data ?? [];
  if (list.some((c) => c.key === key)) return;
  const r = await req('POST', `/api/tournaments/${tournamentId}/categories`, adminId, {
    key,
    displayName,
  });
  if (r.status !== 201 && r.status !== 200 && r.status !== 409) {
    throw new Error(`category ${key}: ${r.status} ${JSON.stringify(r.data)}`);
  }
}

async function listRegs(adminId, tournamentId) {
  return (await req('GET', `/api/tournaments/${tournamentId}/registrations`, adminId)).data ?? [];
}

async function checkInAll(adminId, regs) {
  for (const r of regs) {
    await req('POST', `/api/registrations/${r.id}/checkin/events/check-in`, adminId);
  }
}

async function ensureTournamentRole(adminId, tournamentId, userId, role) {
  const roles = (await req('GET', `/api/tournaments/${tournamentId}/roles`, adminId)).data ?? [];
  if (roles.some((x) => x.userId === userId && x.role === role)) return;
  const r = await req('POST', `/api/tournaments/${tournamentId}/roles`, adminId, { userId, role });
  if (r.status !== 201 && r.status !== 200 && r.status !== 409) {
    throw new Error(`tournamentRole ${userId}/${role}: ${r.status} ${JSON.stringify(r.data)}`);
  }
}

async function advanceToInProgressWithRound1(adminId, tournament, entries, referee) {
  let t = tournament;
  if (t.status === 'draft') {
    await ensureCategory(adminId, t.id, 'dan', '段位組');
    await ensureCategory(adminId, t.id, 'kyu', '級位組');
    t = (await transition(adminId, t.id, 'publish')).data ?? t;
  }
  await ensureEntryRegistrations(adminId, t.id, entries, t.status);
  if (t.status === 'published') {
    for (const e of entries) await register(e.userId, t.id, e.categoryKey);
    t = (await transition(adminId, t.id, 'open-checkin')).data ?? t;
  }
  if (t.status === 'checkin_open') {
    const regs = await listRegs(adminId, t.id);
    await checkInAll(adminId, regs);
    t = (await transition(adminId, t.id, 'lock-for-pairing')).data ?? t;
  }
  if (referee) {
    await ensureTournamentRole(adminId, t.id, referee.id, 'referee');
  }
  if (t.status === 'pairing_ready') {
    await req('POST', `/api/tournaments/${t.id}/pairings/events/generate-round`, adminId, { roundNo: 1 });
    t = (await transition(adminId, t.id, 'start')).data ?? t;
  } else if (t.status === 'in_progress') {
    // 已進行中：確保有第 1 輪（若無則補產）
    const matches = (await req('GET', `/api/tournaments/${t.id}/matches`, adminId)).data;
    const hasR1 = Array.isArray(matches) && matches.some((m) => m.roundNo === 1);
    if (!hasR1) {
      await req('POST', `/api/tournaments/${t.id}/pairings/events/generate-round`, adminId, { roundNo: 1 });
    }
    await ensureEntryRegistrations(adminId, t.id, entries, t.status);
  }
  return t;
}

async function main() {
  console.log('Seed realistic scenarios: BASE =', BASE);
  const health = await waitHealth();

  // ----- 帳號 -----
  console.log('\n1) 建立帳號與顯示名稱');
  await ensureUser(PA.id);
  await grantPlatformAdmin(PA.id, PA.name);

  const allNamed = [
    PA,
    ...ORGS.flatMap((o) => [o.owner, ...o.members, ...(o.referee ? [o.referee] : [])]),
    ...PLAYERS,
  ];
  // 去重
  const seen = new Set();
  for (const u of allNamed) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    if (health.db?.enabled) {
      await upsertUserAsAdmin(u, u.id === PA.id ? 'platform_admin' : null);
    } else {
      await ensureUser(u.id);
      await req('PATCH', '/api/me', u.id, { displayName: u.name });
    }
    console.log(`   ${u.id.padEnd(14)} ${u.name}`);
  }

  // ----- 主辦 -----
  console.log('\n2) 主辦單位與成員');
  const orgBySlug = {};
  for (const o of ORGS) {
    const org = await ensureOrg(o.owner.id, o.name, o.slug);
    orgBySlug[o.slug] = { ...o, id: org.id };
    for (const m of o.members) {
      await ensureMember(o.owner.id, org.id, m.id, m.role);
    }
    console.log(`   ${o.name} (${o.slug}) id=${org.id}`);
  }

  const gocafe = orgBySlug['taipei-gocafe'];
  const ntu = orgBySlug['ntu-weiqi'];
  const qiyuan = orgBySlug['tpe-qiyuan'];

  // ----- 賽事 -----
  console.log('\n3) 建立賽事並推進至目標狀態');

  // A) GoCafe 週末段位磨練賽 → in_progress + round 1
  let grind = await ensureTournament(gocafe.owner.id, {
    organizationId: gocafe.id,
    name: 'GoCafe 週末段位磨練賽',
    gameKey: 'go',
    rulesetVersion: 'v1',
    format: 'swiss',
    roundCount: 4,
    timezone: 'Asia/Taipei',
  });
  await ensureCategory(gocafe.owner.id, grind.id, 'dan', '段位組');
  await ensureCategory(gocafe.owner.id, grind.id, 'kyu', '級位組');
  grind = await advanceToInProgressWithRound1(
    gocafe.owner.id,
    grind,
    [
      ...PLAYERS.slice(0, 4).map((p) => ({ userId: p.id, categoryKey: 'dan' })),
      ...PLAYERS.slice(4, 8).map((p) => ({ userId: p.id, categoryKey: 'kyu' })),
    ],
    gocafe.referee
  );
  const backfilled = await backfillMatchCategoryKeysDb(grind.id);
  if (backfilled > 0) console.log(`   （已回填磨練賽 ${backfilled} 筆對局組別）`);
  console.log(`   ${grind.name} → ${grind.status ?? 'in_progress'} id=${grind.id}`);

  // B) GoCafe 七月月賽 → published + 12 人報名
  let monthly = await ensureTournament(gocafe.owner.id, {
    organizationId: gocafe.id,
    name: 'GoCafe 七月月賽',
    gameKey: 'go',
    rulesetVersion: 'v1',
    format: 'swiss',
    roundCount: 5,
    timezone: 'Asia/Taipei',
  });
  if (monthly.status === 'draft') {
    await ensureCategory(gocafe.owner.id, monthly.id, 'dan', '段位組');
    await ensureCategory(gocafe.owner.id, monthly.id, 'kyu', '級位組');
    monthly = (await transition(gocafe.owner.id, monthly.id, 'publish')).data ?? monthly;
  } else {
    await ensureCategory(gocafe.owner.id, monthly.id, 'dan', '段位組');
    await ensureCategory(gocafe.owner.id, monthly.id, 'kyu', '級位組');
  }
  if (monthly.status === 'published' || monthly.status === 'checkin_open') {
    const monthlyEntries = PLAYERS.slice(0, 12).map((p, i) => ({
      userId: p.id,
      categoryKey: i < 6 ? 'dan' : 'kyu',
    }));
    await ensureEntryRegistrations(gocafe.owner.id, monthly.id, monthlyEntries, monthly.status);
    for (let i = 0; i < 12; i++) {
      const p = PLAYERS[i];
      await register(p.id, monthly.id, i < 6 ? 'dan' : 'kyu');
    }
  }
  console.log(`   ${monthly.name} → ${monthly.status} id=${monthly.id}`);

  // C) GoCafe 週末報到體驗賽 → checkin_open（供 gc-hsu 報到／改組）
  let checkinDemo = await ensureTournament(gocafe.owner.id, {
    organizationId: gocafe.id,
    name: 'GoCafe 週末報到體驗賽',
    gameKey: 'go',
    rulesetVersion: 'v1',
    format: 'swiss',
    roundCount: 4,
    timezone: 'Asia/Taipei',
  });
  await ensureCategory(gocafe.owner.id, checkinDemo.id, 'dan', '段位組');
  await ensureCategory(gocafe.owner.id, checkinDemo.id, 'kyu', '級位組');
  const checkinEntries = [
    ...PLAYERS.slice(8, 12).map((p) => ({ userId: p.id, categoryKey: 'dan' })),
    ...PLAYERS.slice(12, 16).map((p) => ({ userId: p.id, categoryKey: 'kyu' })),
  ];
  if (checkinDemo.status === 'draft') {
    checkinDemo = (await transition(gocafe.owner.id, checkinDemo.id, 'publish')).data ?? checkinDemo;
  }
  await ensureEntryRegistrations(gocafe.owner.id, checkinDemo.id, checkinEntries, checkinDemo.status);
  if (checkinDemo.status === 'published') {
    for (const e of checkinEntries) await register(e.userId, checkinDemo.id, e.categoryKey);
    checkinDemo = (await transition(gocafe.owner.id, checkinDemo.id, 'open-checkin')).data ?? checkinDemo;
  }
  if (checkinDemo.status === 'checkin_open') {
    const regs = await listRegs(gocafe.owner.id, checkinDemo.id);
    for (const r of regs.slice(0, 4)) {
      await req('POST', `/api/registrations/${r.id}/checkin/events/check-in`, gocafe.owner.id);
    }
  }
  console.log(`   ${checkinDemo.name} → ${checkinDemo.status} id=${checkinDemo.id}`);

  // D) 台大學期盃 → draft
  const semester = await ensureTournament(ntu.owner.id, {
    organizationId: ntu.id,
    name: '台大圍棋社 114 學期盃',
    gameKey: 'go',
    rulesetVersion: 'v1',
    format: 'swiss',
    roundCount: 5,
    timezone: 'Asia/Taipei',
  });
  console.log(`   ${semester.name} → ${semester.status} id=${semester.id}`);

  // E) 棋院夏季段位賽 → checkin_open，8 人報名、前 5 人報到
  let summer = await ensureTournament(qiyuan.owner.id, {
    organizationId: qiyuan.id,
    name: '台北棋院 夏季段位賽',
    gameKey: 'go',
    rulesetVersion: 'v1',
    format: 'swiss',
    roundCount: 6,
    timezone: 'Asia/Taipei',
  });
  if (summer.status === 'draft') {
    summer = (await transition(qiyuan.owner.id, summer.id, 'publish')).data ?? summer;
  }
  if (summer.status === 'published') {
    for (const p of PLAYERS.slice(0, 8)) await register(p.id, summer.id);
    summer = (await transition(qiyuan.owner.id, summer.id, 'open-checkin')).data ?? summer;
  }
  if (summer.status === 'checkin_open') {
    const regs = await listRegs(qiyuan.owner.id, summer.id);
    for (const r of regs.slice(0, 5)) {
      await req('POST', `/api/registrations/${r.id}/checkin/events/check-in`, qiyuan.owner.id);
    }
  }
  console.log(`   ${summer.name} → ${summer.status} id=${summer.id}`);

  // F) 西洋棋體驗賽 → published + 4 人
  let chess = await ensureTournament(qiyuan.owner.id, {
    organizationId: qiyuan.id,
    name: '台北棋院 西洋棋體驗賽',
    gameKey: 'chess',
    rulesetVersion: 'v1',
    format: 'swiss',
    roundCount: 3,
    timezone: 'Asia/Taipei',
  });
  if (chess.status === 'draft') {
    chess = (await transition(qiyuan.owner.id, chess.id, 'publish')).data ?? chess;
  }
  if (chess.status === 'published' || chess.status === 'checkin_open') {
    for (const p of PLAYERS.slice(12, 16)) await register(p.id, chess.id);
  }
  console.log(`   ${chess.name} → ${chess.status} id=${chess.id}`);

  // ----- 摘要 -----
  console.log('\n=== 擬真種子完成 ===');
  console.log('登入：前台右上角「模擬」→ 輸入帳號 ID（無需密碼）\n');
  console.log('帳號 ID          顯示名稱    建議測試');
  console.log(`  ${PA.id.padEnd(14)} ${PA.name.padEnd(8)} 平台總管 → /admin/platform`);
  console.log(`  gc-chen         陳館長      GoCafe owner → /admin`);
  console.log(`  gc-wang         王賽務      GoCafe admin（賽務）`);
  console.log(`  gc-hsu          許志工      GoCafe staff → 週末報到體驗賽（報到／改組）`);
  console.log(`  gc-ref-liu      劉裁判      裁判計分 → /referee`);
  console.log(`  ntu-wu          吳社長      台大圍棋社 owner（草稿賽）`);
  console.log(`  qy-huang        黃院長      棋院 owner（報到中／西洋棋）`);
  console.log(`  pl-yang         楊子軒      參賽者報名／戰績 → /me`);
  console.log('\n詳見 docs/15-roles-usecases-and-test-data.md');
}

main().catch((e) => {
  console.error('種子失敗：', e?.message ?? e);
  process.exit(1);
});
