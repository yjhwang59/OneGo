#!/usr/bin/env node
/**
 * E2E：分組賽事全流程（段位組／級位組獨立編排與排名）
 * 使用：npm run dev:api 後執行 npm run e2e:categories
 */

const BASE = process.env.OTC_API_BASE || process.env.NEXT_PUBLIC_OTC_API_BASE || 'http://127.0.0.1:3875';

const ADMIN = 'e2e-cat-admin';
const P_DAN = ['e2e-cat-d1', 'e2e-cat-d2'];
const P_KYU = ['e2e-cat-k1', 'e2e-cat-k2'];

function headers(userId) {
  return { 'Content-Type': 'application/json', 'x-user-id': userId };
}

function fail(msg, detail) {
  console.error('[E2E FAIL]', msg, detail !== undefined ? detail : '');
  process.exit(1);
}

function assert(condition, msg) {
  if (!condition) fail(msg);
}

async function waitHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      const data = await res.json().catch(() => ({}));
      if (data.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail('API health check timeout');
}

async function postJson(url, userId, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(userId),
    body: body ? JSON.stringify(body) : '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(`${url} ${res.status}`, data.message || data.code || JSON.stringify(data));
  return data;
}

async function getJson(url, userId) {
  const res = await fetch(url, { headers: headers(userId) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(`GET ${url} ${res.status}`, data.message || data.code);
  return data;
}

async function main() {
  console.log('E2E categories flow: BASE =', BASE);
  await waitHealth();

  await fetch(`${BASE}/api/me`, { headers: headers(ADMIN) });
  for (const p of [...P_DAN, ...P_KYU]) {
    await fetch(`${BASE}/api/me`, { headers: headers(p) });
  }

  const slug = 'e2e-cat-' + Date.now().toString(36);
  const org = await postJson(`${BASE}/api/organizations`, ADMIN, { name: 'E2E Cat Org', slug });
  const t = await postJson(`${BASE}/api/tournaments`, ADMIN, {
    organizationId: org.id,
    name: 'E2E Category Cup',
    gameKey: 'go',
    rulesetVersion: 'v1',
    format: 'swiss',
    roundCount: 2,
  });
  const tournamentId = t.id;

  await postJson(`${BASE}/api/tournaments/${tournamentId}/categories`, ADMIN, {
    key: 'dan',
    displayName: '段位組',
  });
  await postJson(`${BASE}/api/tournaments/${tournamentId}/categories`, ADMIN, {
    key: 'kyu',
    displayName: '級位組',
  });

  await postJson(`${BASE}/api/tournaments/${tournamentId}/events/publish`, ADMIN);

  // 未選組應失敗
  const badRes = await fetch(`${BASE}/api/tournaments/${tournamentId}/registrations`, {
    method: 'POST',
    headers: headers(P_DAN[0]),
    body: JSON.stringify({ userId: P_DAN[0] }),
  });
  const badData = await badRes.json().catch(() => ({}));
  assert(badRes.status === 400 && badData.code === 'CATEGORY_REQUIRED', 'missing categoryKey should 400');

  const regIds = [];
  for (const p of P_DAN) {
    const r = await postJson(`${BASE}/api/tournaments/${tournamentId}/registrations`, p, {
      userId: p,
      categoryKey: 'dan',
    });
    regIds.push(r.id);
  }
  for (const p of P_KYU) {
    const r = await postJson(`${BASE}/api/tournaments/${tournamentId}/registrations`, p, {
      userId: p,
      categoryKey: 'kyu',
    });
    regIds.push(r.id);
  }

  await postJson(`${BASE}/api/tournaments/${tournamentId}/events/open-checkin`, ADMIN);
  for (const regId of regIds) {
    await postJson(`${BASE}/api/registrations/${regId}/checkin/events/check-in`, ADMIN);
  }
  await postJson(`${BASE}/api/tournaments/${tournamentId}/events/lock-for-pairing`, ADMIN);
  const matches = await postJson(
    `${BASE}/api/tournaments/${tournamentId}/pairings/events/generate-round`,
    ADMIN,
    { roundNo: 1 }
  );
  await postJson(`${BASE}/api/tournaments/${tournamentId}/events/start`, ADMIN);

  assert(Array.isArray(matches) && matches.length === 2, 'expect 2 matches (1 per group of 2)');

  for (const m of matches) {
    const danSet = new Set(P_DAN);
    const kyuSet = new Set(P_KYU);
    const aDan = danSet.has(m.playerAId);
    const bDan = danSet.has(m.playerBId);
    const aKyu = kyuSet.has(m.playerAId);
    const bKyu = kyuSet.has(m.playerBId);
    assert((aDan && bDan) || (aKyu && bKyu), 'no cross-group pairing');
    assert(m.categoryKey === 'dan' || m.categoryKey === 'kyu', 'match has categoryKey');
  }

  const standings = await getJson(`${BASE}/api/tournaments/${tournamentId}/standings`, ADMIN);
  assert(Array.isArray(standings) && standings.length === 4, 'standings has 4 rows');

  const danRows = standings.filter((r) => r.categoryKey === 'dan');
  const kyuRows = standings.filter((r) => r.categoryKey === 'kyu');
  assert(danRows.length === 2 && kyuRows.length === 2, '2 per group in standings');

  // 鎖定後不可改組
  const changeRes = await fetch(`${BASE}/api/registrations/${regIds[0]}/events/change-category`, {
    method: 'POST',
    headers: headers(ADMIN),
    body: JSON.stringify({ categoryKey: 'kyu' }),
  });
  const changeData = await changeRes.json().catch(() => ({}));
  assert(changeRes.status === 409 && changeData.code === 'CANNOT_CHANGE_CATEGORY', 'change category after lock should 409');

  console.log('\n[E2E OK] categories flow passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
