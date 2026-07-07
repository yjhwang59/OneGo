import process from 'node:process';

import pg from 'pg';

import { resolveDatabaseUrl } from './resolve-db-url.mjs';

/**
 * 建立一組完整的 RBAC 示範資料到本機資料庫，讓每個角色都能立即登入測試：
 *   平台總管 / 主辦 owner·admin·staff / 賽事 organizer·referee / 參賽者
 *
 * 前置：API 需啟動（預設 http://127.0.0.1:3875）。以 `npm run rbac:seed` 執行（會讀 .env 供 DB 授權）。
 */

const BASE = process.env.OTC_API_BASE || process.env.NEXT_PUBLIC_OTC_API_BASE || 'http://127.0.0.1:3875';
const H = (u) => ({ 'Content-Type': 'application/json', 'x-user-id': u });

async function req(method, path, user, body) {
  const bodyStr = body ? JSON.stringify(body) : (method === 'POST' || method === 'PATCH' ? '{}' : undefined);
  const res = await fetch(BASE + path, { method, headers: H(user), body: bodyStr });
  let data = null;
  try { data = await res.json(); } catch { /* 204 等無 body */ }
  return { status: res.status, data };
}
const ensureUser = (u) => req('GET', '/api/me', u);

const ADMIN = 'rbac-admin';
const OWNER = 'rbac-owner';
const ORG_ADMIN = 'rbac-admin2';
const STAFF = 'rbac-staff';
const ORGANIZER = 'rbac-organizer';
const REFEREE = 'rbac-referee';
const PLAYERS = ['rbac-p1', 'rbac-p2', 'rbac-p3', 'rbac-p4'];

async function main() {
  // 檢查 API
  const health = await fetch(BASE + '/api/health').then((r) => r.json()).catch(() => null);
  if (!health?.ok) {
    console.error(`無法連線 API（${BASE}）。請先啟動：npm start 或 npm run dev:api`);
    process.exit(1);
  }
  if (!health.db?.enabled) {
    console.warn('注意：API 目前未連接資料庫（InMemory 模式），種子重啟後不保留。');
  }

  // 1) 確保所有帳號存在
  for (const u of [ADMIN, OWNER, ORG_ADMIN, STAFF, ORGANIZER, REFEREE, ...PLAYERS]) await ensureUser(u);

  // 2) 建立主辦單位（owner 自動成為 owner）
  const slug = 'rbac-demo';
  let org = (await req('GET', '/api/organizations', OWNER)).data?.find?.((o) => o.slug === slug);
  if (!org) {
    const created = await req('POST', '/api/organizations', OWNER, { name: 'RBAC 示範主辦', slug });
    if (created.status !== 201 && created.status !== 200) throw new Error(`建立主辦失敗：${JSON.stringify(created.data)}`);
    org = created.data;
  }
  const orgId = org.id;

  // 3) 加入 admin / staff 成員
  const members = (await req('GET', `/api/organizations/${orgId}/members`, OWNER)).data ?? [];
  const hasMember = (uid) => members.some((m) => m.userId === uid);
  if (!hasMember(ORG_ADMIN)) await req('POST', `/api/organizations/${orgId}/members`, OWNER, { userId: ORG_ADMIN, role: 'admin' });
  if (!hasMember(STAFF)) await req('POST', `/api/organizations/${orgId}/members`, OWNER, { userId: STAFF, role: 'staff' });

  // 4) 建立賽事
  const t = await req('POST', '/api/tournaments', OWNER, {
    organizationId: orgId, name: 'RBAC 示範賽', gameKey: 'go', rulesetVersion: 'v1', format: 'swiss', roundCount: 2, timezone: 'UTC'
  });
  if (t.status !== 201 && t.status !== 200) throw new Error(`建立賽事失敗：${JSON.stringify(t.data)}`);
  const tId = t.data.id;

  // 5) 指派賽事角色 organizer / referee
  await req('POST', `/api/tournaments/${tId}/roles`, OWNER, { userId: ORGANIZER, role: 'organizer' });
  await req('POST', `/api/tournaments/${tId}/roles`, OWNER, { userId: REFEREE, role: 'referee' });

  // 6) 推進賽事至 in_progress 並產生第一輪（讓 referee 有得計分）
  await req('POST', `/api/tournaments/${tId}/events/publish`, OWNER);
  await req('POST', `/api/tournaments/${tId}/events/open-checkin`, OWNER);
  for (const p of PLAYERS) await req('POST', `/api/tournaments/${tId}/registrations`, p, { userId: p });
  const regs = (await req('GET', `/api/tournaments/${tId}/registrations`, OWNER)).data ?? [];
  for (const r of regs) await req('POST', `/api/registrations/${r.id}/checkin/events/check-in`, OWNER);
  await req('POST', `/api/tournaments/${tId}/events/lock-for-pairing`, OWNER);
  await req('POST', `/api/tournaments/${tId}/events/start`, OWNER);
  await req('POST', `/api/tournaments/${tId}/pairings/events/generate-round`, OWNER, { roundNo: 1 });

  // 7) 授予平台總管（直接寫 DB；免手動 SQL）
  const databaseUrl = resolveDatabaseUrl();
  if (databaseUrl) {
    const client = new pg.Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await client.query("UPDATE users SET platform_role='platform_admin', updated_at=now() WHERE id=$1", [ADMIN]);
    } finally {
      await client.end().catch(() => {});
    }
    console.log(`已授予 ${ADMIN} 平台總管權限。`);
  } else {
    console.warn(`無 DATABASE_URL，略過平台總管授權。可改用：npm run grant:admin -- ${ADMIN}`);
  }

  console.log('\n=== RBAC 示範資料完成 ===');
  console.log(`主辦單位：${org.name}（${slug}） id=${orgId}`);
  console.log(`賽事：RBAC 示範賽（in_progress，已產生第 1 輪） id=${tId}`);
  console.log('\n可用「模擬登入」以下帳號測試各角色：');
  console.log(`  平台總管        ${ADMIN}      → /admin/platform`);
  console.log(`  主辦 owner      ${OWNER}      → /admin（可管理成員、刪除主辦）`);
  console.log(`  主辦 admin      ${ORG_ADMIN}  → /admin（可管理成員/賽事，不可刪除主辦）`);
  console.log(`  主辦 staff      ${STAFF}      → /admin（唯讀作戰台，不可管理成員）`);
  console.log(`  賽事 organizer  ${ORGANIZER}  → 可管理該賽事`);
  console.log(`  賽事 referee    ${REFEREE}    → /referee（可計分）`);
  console.log(`  參賽者          ${PLAYERS.join(', ')}`);
}

main().catch((e) => {
  console.error('種子失敗：', e?.message ?? e);
  process.exit(1);
});
