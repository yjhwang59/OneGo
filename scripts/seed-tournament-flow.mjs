#!/usr/bin/env node
/**
 * 賽事管理種子流程：
 * 1. 3 個主辦單位，各有管理員（可建立賽事）
 * 2. 每個主辦單位 2 個賽事，名稱前加主辦單位簡稱
 * 3. 20 位棋友基本資料
 * 4. 8 位棋友報名「GoCafe段位磨練賽」
 * 5. 12 位棋友報名「GoCafe月賽」
 *
 * 使用：先啟動 API (npm run dev:api)，再執行 node scripts/seed-tournament-flow.mjs
 * 環境變數：OTC_API_BASE（預設 http://127.0.0.1:3875）
 */

const BASE = process.env.OTC_API_BASE || process.env.NEXT_PUBLIC_OTC_API_BASE || 'http://127.0.0.1:3875';

function headers(userId) {
  return { 'Content-Type': 'application/json', 'x-user-id': userId };
}

async function waitHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        console.log('API health OK');
        return;
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('API health check timeout');
}

async function ensureUser(userId) {
  const res = await fetch(`${BASE}/api/me`, { headers: headers(userId) });
  if (!res.ok) throw new Error(`ensureUser ${userId}: ${res.status}`);
  return res.json();
}

async function listOrgs(adminUserId) {
  const res = await fetch(`${BASE}/api/organizations`, { headers: headers(adminUserId) });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function ensureOrg(adminUserId, name, slug) {
  const list = await listOrgs(adminUserId);
  const existing = list.find((o) => o.slug === slug);
  if (existing) return existing;
  const res = await fetch(`${BASE}/api/organizations`, {
    method: 'POST',
    headers: headers(adminUserId),
    body: JSON.stringify({ name, slug }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`createOrg ${name}: ${res.status} ${data.message || data.code || ''}`);
  return data;
}

async function listTournaments(adminUserId) {
  const res = await fetch(`${BASE}/api/tournaments`, { headers: headers(adminUserId) });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function ensureTournament(adminUserId, body) {
  const list = await listTournaments(adminUserId);
  const existing = list.find((t) => t.name === body.name);
  if (existing) return existing;
  const res = await fetch(`${BASE}/api/tournaments`, {
    method: 'POST',
    headers: headers(adminUserId),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`createTournament ${body.name}: ${res.status} ${data.message || data.code || ''}`);
  return data;
}

async function publishTournament(adminUserId, tournamentId) {
  const res = await fetch(`${BASE}/api/tournaments/${tournamentId}/events/publish`, {
    method: 'POST',
    headers: headers(adminUserId),
    body: '{}',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`publish ${tournamentId}: ${res.status} ${data.message || data.code || ''}`);
  return data;
}

async function register(userId, tournamentId) {
  const res = await fetch(`${BASE}/api/tournaments/${tournamentId}/registrations`, {
    method: 'POST',
    headers: headers(userId),
    body: JSON.stringify({ userId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.code === 'ALREADY_REGISTERED') return { skipped: true };
    throw new Error(`register ${userId} -> ${tournamentId}: ${res.status} ${data.message || data.code || ''}`);
  }
  return data;
}

async function main() {
  console.log('Seed tournament flow: BASE =', BASE);
  await waitHealth();

  // ----- 1. 三個主辦單位與各自管理員 -----
  const orgs = [
    { adminId: 'gocafe-admin', name: 'GoCafe', slug: 'gocafe', shortName: 'GoCafe' },
    { adminId: 'weiqi-admin', name: '圍棋學會', slug: 'weiqi', shortName: '圍棋學會' },
    { adminId: 'qiyuan-admin', name: '棋院', slug: 'qiyuan', shortName: '棋院' },
  ];

  console.log('\n1) 確保主辦管理員並建立 3 個主辦單位');
  for (const org of orgs) {
    await ensureUser(org.adminId);
    const created = await ensureOrg(org.adminId, org.name, org.slug);
    org.id = created.id;
    console.log(`   主辦: ${org.name} (${org.slug}) id=${org.id}`);
  }

  // ----- 2. 每個主辦 2 個賽事，名稱前加主辦單位簡稱 -----
  const tournamentBodies = [
    { orgIndex: 0, name: 'GoCafe段位磨練賽', gameKey: 'go', format: 'swiss', roundCount: 5 },
    { orgIndex: 0, name: 'GoCafe月賽', gameKey: 'go', format: 'swiss', roundCount: 4 },
    { orgIndex: 1, name: '圍棋學會段位賽', gameKey: 'go', format: 'swiss', roundCount: 4 },
    { orgIndex: 1, name: '圍棋學會月賽', gameKey: 'go', format: 'swiss', roundCount: 3 },
    { orgIndex: 2, name: '棋院段位賽', gameKey: 'go', format: 'swiss', roundCount: 4 },
    { orgIndex: 2, name: '棋院月賽', gameKey: 'go', format: 'swiss', roundCount: 3 },
  ];

  console.log('\n2) 每個主辦單位建立 2 個賽事');
  const tournaments = [];
  for (const tb of tournamentBodies) {
    const org = orgs[tb.orgIndex];
    const t = await ensureTournament(org.adminId, {
      organizationId: org.id,
      name: tb.name,
      gameKey: tb.gameKey,
      rulesetVersion: 'v1',
      format: tb.format,
      roundCount: tb.roundCount,
    });
    tournaments.push({ ...tb, id: t.id, name: tb.name, status: t.status });
    console.log(`   賽事: ${tb.name} id=${t.id} status=${t.status}`);
  }

  const gocafeDuanweiId = tournaments.find((t) => t.name === 'GoCafe段位磨練賽').id;
  const gocafeYuesaiId = tournaments.find((t) => t.name === 'GoCafe月賽').id;

  // ----- 3. 20 位棋友基本資料 -----
  console.log('\n3) 建立 20 位棋友（確保使用者存在）');
  const playerIds = Array.from({ length: 20 }, (_, i) => `player-${String(i + 1).padStart(2, '0')}`);
  for (const pid of playerIds) {
    await ensureUser(pid);
  }
  console.log(`   棋友: ${playerIds.join(', ')}`);

  // ----- 4. 發布 GoCafe 兩場賽事（才能報名） -----
  console.log('\n4) 發布 GoCafe段位磨練賽、GoCafe月賽');
  const gocafeDuanwei = tournaments.find((t) => t.name === 'GoCafe段位磨練賽');
  const gocafeYuesai = tournaments.find((t) => t.name === 'GoCafe月賽');
  if (gocafeDuanwei?.status === 'draft') {
    await publishTournament('gocafe-admin', gocafeDuanweiId);
  } else console.log('   GoCafe段位磨練賽 已是已發布狀態');
  if (gocafeYuesai?.status === 'draft') {
    await publishTournament('gocafe-admin', gocafeYuesaiId);
  } else console.log('   GoCafe月賽 已是已發布狀態');
  console.log('   開放報名');

  // ----- 5. 8 位棋友報名 GoCafe段位磨練賽 -----
  console.log('\n5) 8 位棋友報名 GoCafe段位磨練賽');
  const duanweiPlayers = playerIds.slice(0, 8);
  for (const pid of duanweiPlayers) {
    const r = await register(pid, gocafeDuanweiId);
    console.log(`   ${r.skipped ? '已報名(略過)' : '已報名'}: ${pid}`);
  }

  // ----- 6. 12 位棋友報名 GoCafe月賽 -----
  console.log('\n6) 12 位棋友報名 GoCafe月賽');
  const yuesaiPlayers = playerIds.slice(8, 20);
  for (const pid of yuesaiPlayers) {
    const r = await register(pid, gocafeYuesaiId);
    console.log(`   ${r.skipped ? '已報名(略過)' : '已報名'}: ${pid}`);
  }

  console.log('\n--- 種子流程完成 ---');
  console.log('主辦單位: 3 個（GoCafe、圍棋學會、棋院）');
  console.log('賽事: 6 個（每主辦 2 個）');
  console.log('棋友: 20 位（player-01..player-20）');
  console.log('GoCafe段位磨練賽 報名: 8 人 (player-01..08)');
  console.log('GoCafe月賽 報名: 12 人 (player-09..20)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
