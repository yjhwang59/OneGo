#!/usr/bin/env node
/**
 * E2E：RBAC 矩陣抽樣（staff 403、referee 計分、停權）
 * 使用：npm run dev:api 後執行 npm run e2e:rbac-matrix
 */

const BASE = process.env.OTC_API_BASE || process.env.NEXT_PUBLIC_OTC_API_BASE || 'http://127.0.0.1:3875';

const OWNER = 'e2e-rbac-owner';
const STAFF = 'e2e-rbac-staff';
const REFEREE = 'e2e-rbac-ref';
const PLAYER = 'e2e-rbac-p1';
const PLAYER2 = 'e2e-rbac-p2';
const SUSPENDED = 'e2e-rbac-susp';

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
      if (data.ok) return data;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail('API health check timeout');
}

async function ensureUser(id) {
  await fetch(`${BASE}/api/me`, { headers: headers(id) });
}

async function postJson(url, userId, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(userId),
    body: body ? JSON.stringify(body) : '{}',
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log('E2E RBAC matrix: BASE =', BASE);
  const health = await waitHealth();

  for (const u of [OWNER, STAFF, REFEREE, PLAYER, PLAYER2, SUSPENDED]) await ensureUser(u);

  const slug = 'e2e-rbac-' + Date.now().toString(36);
  const orgRes = await postJson(`${BASE}/api/organizations`, OWNER, { name: 'E2E RBAC Org', slug });
  if (orgRes.status !== 201 && orgRes.status !== 200) fail('create org', orgRes.data);
  const orgId = orgRes.data.id;

  const memRes = await postJson(`${BASE}/api/organizations/${orgId}/members`, OWNER, {
    userId: STAFF,
    role: 'staff',
  });
  assert(memRes.status === 201 || memRes.status === 200 || memRes.status === 409, 'add staff member');

  // staff 不可建立賽事
  const staffTour = await postJson(`${BASE}/api/tournaments`, STAFF, {
    organizationId: orgId,
    name: 'Staff Tournament',
    gameKey: 'go',
    format: 'swiss',
    roundCount: 1,
  });
  assert(staffTour.status === 403, 'staff create tournament should 403');

  const tourRes = await postJson(`${BASE}/api/tournaments`, OWNER, {
    organizationId: orgId,
    name: 'E2E RBAC Cup',
    gameKey: 'go',
    rulesetVersion: 'v1',
    format: 'swiss',
    roundCount: 1,
  });
  assert(tourRes.status === 200 || tourRes.status === 201, 'create tournament');
  const tournamentId = tourRes.data.id;

  await postJson(`${BASE}/api/tournaments/${tournamentId}/events/publish`, OWNER);
  await postJson(`${BASE}/api/tournaments/${tournamentId}/registrations`, PLAYER, { userId: PLAYER });
  await postJson(`${BASE}/api/tournaments/${tournamentId}/registrations`, PLAYER2, { userId: PLAYER2 });
  await postJson(`${BASE}/api/tournaments/${tournamentId}/events/open-checkin`, OWNER);
  const regs = await fetch(`${BASE}/api/tournaments/${tournamentId}/registrations`, { headers: headers(OWNER) })
    .then((r) => r.json());
  for (const reg of regs) {
    if (reg.status !== 'cancelled') {
      await postJson(`${BASE}/api/registrations/${reg.id}/checkin/events/check-in`, OWNER);
    }
  }
  await postJson(`${BASE}/api/tournaments/${tournamentId}/events/lock-for-pairing`, OWNER);
  const matchesRes = await postJson(
    `${BASE}/api/tournaments/${tournamentId}/pairings/events/generate-round`,
    OWNER,
    { roundNo: 1 }
  );
  assert(matchesRes.status === 200 || matchesRes.status === 201, 'generate round');
  await postJson(`${BASE}/api/tournaments/${tournamentId}/events/start`, OWNER);
  const mlist = Array.isArray(matchesRes.data) ? matchesRes.data : [];
  const mid = mlist[0]?.id;
  assert(mid, 'need a match');

  await postJson(`${BASE}/api/tournaments/${tournamentId}/roles`, OWNER, {
    userId: REFEREE,
    role: 'referee',
  });

  const refScore = await postJson(`${BASE}/api/matches/${mid}/result`, REFEREE, {
    result: { kind: 'win', winner: 'A', by: 'resign' },
  });
  assert(refScore.status === 200, 'referee submit result should 200');

  const playerScore = await postJson(`${BASE}/api/matches/${mid}/result`, PLAYER, {
    result: { kind: 'win', winner: 'B', by: 'resign' },
  });
  assert(playerScore.status === 403, 'non-referee submit should 403');

  // 停權（需 platform admin 或 dev bootstrap）
  if (health.db?.enabled && process.env.OTC_ALLOW_DEV_BOOTSTRAP === '1') {
    const boot = await postJson(`${BASE}/api/dev/bootstrap-platform-admin`, SUSPENDED, {});
    if (boot.status === 200 || boot.status === 201) {
      await postJson(`${BASE}/api/platform/users`, SUSPENDED, {
        id: SUSPENDED,
        displayName: 'Suspended User',
      }).catch(() => {});
      const susp = await fetch(`${BASE}/api/platform/users/${encodeURIComponent(SUSPENDED)}`, {
        method: 'PATCH',
        headers: headers(SUSPENDED),
        body: JSON.stringify({ status: 'suspended' }),
      });
      if (susp.ok) {
        const blocked = await fetch(`${BASE}/api/me`, { headers: headers(SUSPENDED) });
        const blockedData = await blocked.json().catch(() => ({}));
        assert(blocked.status === 403 && blockedData.code === 'ACCOUNT_SUSPENDED', 'suspended user blocked');
      }
    }
  } else {
    console.log('[skip] suspend test (needs DB + OTC_ALLOW_DEV_BOOTSTRAP=1)');
  }

  console.log('\n[E2E OK] RBAC matrix passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
