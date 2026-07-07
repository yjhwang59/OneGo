#!/usr/bin/env node
/**
 * E2E 完整比賽流程：主辦 → 賽事 → 報名 → 報到 → 多輪瑞士制編排 → 成績上傳 → 主分/輔分排名 → 關閉賽事。
 * 使用：先啟動 API (npm run dev:api)，再執行 node scripts/e2e-full-tournament.mjs
 * 環境變數：OTC_API_BASE（預設 http://127.0.0.1:3875）
 */

const BASE = process.env.OTC_API_BASE || process.env.NEXT_PUBLIC_OTC_API_BASE || 'http://127.0.0.1:3875';

const ORG_ADMIN = 'e2e-org-admin';
const PLAYER_IDS = ['e2e-p1', 'e2e-p2', 'e2e-p3', 'e2e-p4'];
const ROUND_COUNT = 3;

const DEFAULT_TIEBREAK_ORDER = ['wins', 'head_to_head', 'opponent_score'];

function headers(userId) {
  return { 'Content-Type': 'application/json', 'x-user-id': userId };
}

function fail(msg, detail) {
  console.error('[E2E FAIL]', msg, detail !== undefined ? detail : '');
  process.exit(1);
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
  fail('API health check timeout');
}

async function ensureUser(userId) {
  const res = await fetch(`${BASE}/api/me`, { headers: headers(userId) });
  if (!res.ok) fail(`ensureUser ${userId}`, res.status);
  return res.json();
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
  if (!res.ok) fail(`GET ${url} ${res.status}`, data.message || data.code || JSON.stringify(data));
  return data;
}

async function getJsonPublic(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(`GET ${url} ${res.status}`, data.message || data.code || JSON.stringify(data));
  return data;
}

function assert(condition, msg) {
  if (!condition) fail(msg);
}

async function main() {
  console.log('E2E full tournament flow: BASE =', BASE);
  await waitHealth();

  // --- 1. 主辦與棋友 ---
  await ensureUser(ORG_ADMIN);
  for (const pid of PLAYER_IDS) await ensureUser(pid);

  const slug = 'e2e-full-' + Date.now().toString(36);
  console.log('\n1) Create organization');
  const org = await postJson(`${BASE}/api/organizations`, ORG_ADMIN, { name: 'E2E Full Tournament Org', slug });
  const orgId = org.id;
  console.log('   orgId=', orgId);

  console.log('\n2) Create tournament (draft)');
  const t = await postJson(`${BASE}/api/tournaments`, ORG_ADMIN, {
    organizationId: orgId,
    name: 'E2E Swiss Cup',
    gameKey: 'go',
    rulesetVersion: 'v1',
    format: 'swiss',
    roundCount: ROUND_COUNT,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 86400000).toISOString(),
  });
  const tournamentId = t.id;
  assert(t.status === 'draft', 'tournament should be draft');
  console.log('   tournamentId=', tournamentId);

  console.log('\n3) Publish');
  const pub = await postJson(`${BASE}/api/tournaments/${tournamentId}/events/publish`, ORG_ADMIN);
  assert(pub.status === 'published', 'status should be published');

  console.log('\n4) Register players');
  const registrationIds = [];
  for (const pid of PLAYER_IDS) {
    const r = await postJson(`${BASE}/api/tournaments/${tournamentId}/registrations`, pid, { userId: pid });
    registrationIds.push(r.id);
  }
  console.log('   registered:', PLAYER_IDS.length);

  console.log('\n5) Open check-in');
  const chk = await postJson(`${BASE}/api/tournaments/${tournamentId}/events/open-checkin`, ORG_ADMIN);
  assert(chk.status === 'checkin_open', 'status should be checkin_open');

  console.log('\n6) Check-in all');
  for (const regId of registrationIds) {
    await postJson(`${BASE}/api/registrations/${regId}/checkin/events/check-in`, ORG_ADMIN);
  }

  console.log('\n7) Lock for pairing');
  const lock = await postJson(`${BASE}/api/tournaments/${tournamentId}/events/lock-for-pairing`, ORG_ADMIN);
  assert(lock.status === 'pairing_ready', 'status should be pairing_ready');

  // --- 8. 多輪編排與成績 ---
  for (let roundNo = 1; roundNo <= ROUND_COUNT; roundNo++) {
    console.log(`\n8.${roundNo}) Generate round ${roundNo}`);
    const matches = await postJson(
      `${BASE}/api/tournaments/${tournamentId}/pairings/events/generate-round`,
      ORG_ADMIN,
      { roundNo }
    );
    assert(Array.isArray(matches), 'matches should be array');
    const matchCount = matches.length;
    assert(matchCount >= 1, 'at least one match per round');
    if (roundNo === 1) {
      console.log(`   Start tournament`);
      const start = await postJson(`${BASE}/api/tournaments/${tournamentId}/events/start`, ORG_ADMIN);
      assert(start.status === 'in_progress', 'status should be in_progress');
    }
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const result = { kind: 'win', winner: i % 2 === 0 ? 'A' : 'B', by: 'resign' };
      await postJson(`${BASE}/api/matches/${m.id}/result`, ORG_ADMIN, { result });
    }
    console.log(`   Submitted ${matchCount} result(s)`);
  }

  console.log('\n9) Get standings (protected)');
  const standings = await getJson(`${BASE}/api/tournaments/${tournamentId}/standings`, ORG_ADMIN);
  assert(Array.isArray(standings), 'standings should be array');
  assert(standings.length === PLAYER_IDS.length, `standings length ${standings.length} should equal participants ${PLAYER_IDS.length}`);

  for (const row of standings) {
    assert(typeof row.points === 'number', `row ${row.playerId} should have points`);
    assert(row.tiebreaks != null && typeof row.tiebreaks === 'object', `row ${row.playerId} should have tiebreaks`);
    assert(typeof row.tiebreaks.wins === 'number', 'tiebreaks.wins');
    assert(typeof row.tiebreaks.head_to_head === 'number', 'tiebreaks.head_to_head');
    assert(typeof row.tiebreaks.opponent_score === 'number', 'tiebreaks.opponent_score');
  }

  for (let i = 1; i < standings.length; i++) {
    const prev = standings[i - 1];
    const curr = standings[i];
    assert(prev.points >= curr.points, 'standings should be sorted by points descending');
    if (prev.points === curr.points) {
      for (const key of DEFAULT_TIEBREAK_ORDER) {
        const pv = prev.tiebreaks?.[key] ?? (key === 'wins' ? prev.wins : 0);
        const cv = curr.tiebreaks?.[key] ?? (key === 'wins' ? curr.wins : 0);
        if (pv !== cv) {
          assert(pv >= cv, `tiebreak ${key} should be descending`);
          break;
        }
      }
    }
  }
  console.log('   Standings: points and tiebreaks OK, order OK');

  console.log('\n10) Get public standings');
  const publicStandings = await getJsonPublic(`${BASE}/api/public/tournaments/${tournamentId}/standings`);
  assert(Array.isArray(publicStandings), 'public standings should be array');
  assert(publicStandings.length === PLAYER_IDS.length, 'public standings length');

  console.log('\n11) Close tournament');
  const closed = await postJson(`${BASE}/api/tournaments/${tournamentId}/events/close`, ORG_ADMIN);
  assert(closed.status === 'closed', 'status should be closed');

  console.log('\n--- E2E full tournament flow PASSED ---');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
