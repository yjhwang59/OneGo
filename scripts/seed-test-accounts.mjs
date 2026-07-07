import process from 'node:process';

import pg from 'pg';

import { resolveDatabaseUrl } from './resolve-db-url.mjs';

/**
 * 建立一組「可測試帳號」到本機資料庫：
 *   1 位系統總管理者 / 3 位賽務管理 / 10 位選手
 * 並建立一個測試主辦單位（讓 3 位賽務管理成為真正的管理者）與一場已發布賽事（供選手報名）。
 *
 * 執行：npm run test:accounts（會讀 .env 供平台總管授權）。需先啟動 API。
 * 登入方式：本 MVP 以「模擬登入」輸入「帳號 ID」即可，無需密碼。
 */

const BASE = process.env.OTC_API_BASE || process.env.NEXT_PUBLIC_OTC_API_BASE || 'http://127.0.0.1:3875';

async function req(method, path, user, body) {
  const bodyStr = body ? JSON.stringify(body) : (method === 'POST' || method === 'PATCH' ? '{}' : undefined);
  const headers = { 'x-user-id': user };
  if (bodyStr !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: bodyStr });
  let data = null;
  try { data = await res.json(); } catch { /* 204 */ }
  return { status: res.status, data };
}

const ADMIN = { id: 'otc-admin', name: '系統總管理者' };
const MANAGERS = [
  { id: 'otc-mgr-1', name: '賽務管理員 A', role: 'owner' },
  { id: 'otc-mgr-2', name: '賽務管理員 B', role: 'admin' },
  { id: 'otc-mgr-3', name: '賽務管理員 C', role: 'admin' },
];
const PLAYERS = Array.from({ length: 10 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { id: `otc-player-${n}`, name: `選手 ${n}` };
});

/** 建立帳號並設定顯示名稱（idempotent）。以總管身分呼叫。 */
async function upsertUser(u, platformRole = null) {
  const created = await req('POST', '/api/platform/users', ADMIN.id, {
    id: u.id, displayName: u.name, platformRole,
  });
  if (created.status === 201) return;
  if (created.status === 409) {
    // 已存在 → 更新顯示名稱（及必要時平台角色）
    await req('PATCH', `/api/platform/users/${encodeURIComponent(u.id)}`, ADMIN.id, {
      displayName: u.name, ...(platformRole !== undefined ? { platformRole } : {}),
    });
    return;
  }
  throw new Error(`建立 ${u.id} 失敗：${created.status} ${JSON.stringify(created.data)}`);
}

async function main() {
  const health = await fetch(BASE + '/api/health').then((r) => r.json()).catch(() => null);
  if (!health?.ok) {
    console.error(`無法連線 API（${BASE}）。請先啟動：npm start 或 npm run dev:api`);
    process.exit(1);
  }
  if (!health.db?.enabled) console.warn('注意：目前為 InMemory 模式，帳號重啟後不保留。');

  // 1) 建立總管理者並授予 platform_admin（直接寫 DB，免手動 SQL）
  await req('GET', '/api/me', ADMIN.id); // ensureUser
  const databaseUrl = resolveDatabaseUrl();
  if (databaseUrl) {
    const client = new pg.Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await client.query(
        "UPDATE users SET platform_role='platform_admin', display_name=$2, updated_at=now() WHERE id=$1",
        [ADMIN.id, ADMIN.name]
      );
    } finally { await client.end().catch(() => {}); }
  } else {
    console.warn(`無 DATABASE_URL，略過平台總管授權。可改用：npm run grant:admin -- ${ADMIN.id}`);
  }

  // 2) 賽務管理 + 選手帳號（以總管身分建立，設定顯示名稱）
  for (const m of MANAGERS) await upsertUser(m, null);
  for (const p of PLAYERS) await upsertUser(p, null);

  // 3) 測試主辦單位（mgr-1 為 owner，mgr-2/mgr-3 為 admin）
  const slug = 'otc-test-center';
  let org = (await req('GET', '/api/organizations', MANAGERS[0].id)).data?.find?.((o) => o.slug === slug);
  if (!org) {
    const created = await req('POST', '/api/organizations', MANAGERS[0].id, { name: 'OneGo 測試賽務中心', slug });
    if (created.status !== 201 && created.status !== 200) throw new Error(`建立主辦失敗：${JSON.stringify(created.data)}`);
    org = created.data;
  }
  const orgMembers = (await req('GET', `/api/organizations/${org.id}/members`, MANAGERS[0].id)).data ?? [];
  for (const m of MANAGERS.slice(1)) {
    if (!orgMembers.some((x) => x.userId === m.id)) {
      await req('POST', `/api/organizations/${org.id}/members`, MANAGERS[0].id, { userId: m.id, role: m.role });
    }
  }

  // 4) 一場已發布賽事（開放報名），讓選手可測試報名
  const tlist = (await req('GET', '/api/tournaments', MANAGERS[0].id)).data ?? [];
  let tour = tlist.find?.((t) => t.name === '測試公開賽' && t.organizationId === org.id);
  if (!tour) {
    const created = await req('POST', '/api/tournaments', MANAGERS[0].id, {
      organizationId: org.id, name: '測試公開賽', gameKey: 'go', rulesetVersion: 'v1', format: 'swiss', roundCount: 3, timezone: 'Asia/Taipei',
    });
    tour = created.data;
    await req('POST', `/api/tournaments/${tour.id}/events/publish`, MANAGERS[0].id);
  }

  // 摘要
  const line = (id, name, note) => console.log(`  ${id.padEnd(16)} ${String(name).padEnd(12)} ${note}`);
  console.log('\n=== 可測試帳號建立完成（本機資料庫）===');
  console.log(`登入方式：右上角「模擬」→ 輸入下方「帳號 ID」（無需密碼）。\n`);
  console.log('帳號 ID            顯示名稱      角色/用途');
  line(ADMIN.id, ADMIN.name, '系統總管理者（platform_admin）→ /admin/platform');
  MANAGERS.forEach((m, i) =>
    line(m.id, m.name, `賽務管理（主辦「${org.name}」${m.role === 'owner' ? 'owner' : 'admin'}）→ /admin`)
  );
  PLAYERS.forEach((p) => line(p.id, p.name, '選手 → 瀏覽賽事並報名'));
  console.log(`\n測試主辦單位：${org.name}（${slug}）`);
  console.log(`測試賽事：測試公開賽（已發布，開放報名） id=${tour?.id}`);
}

main().catch((e) => {
  console.error('建立測試帳號失敗：', e?.message ?? e);
  process.exit(1);
});
