#!/usr/bin/env node
/**
 * E2E 用戶管理：平台總管 CRUD、自助 PATCH /api/me、停權防呆。
 * 使用：API 需設 OTC_ALLOW_DEV_BOOTSTRAP=1（首次自封總管），再執行本腳本。
 */

const BASE = process.env.OTC_API_BASE || process.env.NEXT_PUBLIC_OTC_API_BASE || 'http://127.0.0.1:3875';

const ADMIN = 'e2e-users-admin';
const USER_A = 'e2e-users-a';
const USER_B = 'e2e-users-b';

function headers(userId) {
  return { 'Content-Type': 'application/json', 'x-user-id': userId };
}

function fail(msg, detail) {
  console.error('[E2E FAIL]', msg, detail !== undefined ? detail : '');
  process.exit(1);
}

function assert(c, msg) {
  if (!c) fail(msg);
}

async function waitHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      const data = await res.json().catch(() => ({}));
      if (data.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  fail('API health check timeout');
}

async function post(url, userId, body) {
  const res = await fetch(url, { method: 'POST', headers: headers(userId), body: body ? JSON.stringify(body) : '{}' });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function patch(url, userId, body) {
  const res = await fetch(url, { method: 'PATCH', headers: headers(userId), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function get(url, userId) {
  const res = await fetch(url, { headers: headers(userId) });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function del(url, userId) {
  const res = await fetch(url, { method: 'DELETE', headers: { 'x-user-id': userId } });
  return { res, status: res.status };
}

async function ensureUser(userId) {
  const { res } = await get(`${BASE}/api/me`, userId);
  if (!res.ok) fail(`ensureUser ${userId}`, res.status);
}

async function bootstrapPlatformAdmin(adminId) {
  await ensureUser(adminId);
  let { res } = await get(`${BASE}/api/platform/users?limit=1`, adminId);
  if (res.ok) return;
  ({ res } = await post(`${BASE}/api/dev/promote-platform-admin`, adminId, {}));
  if (!res.ok) {
    fail(
      '需要 platform_admin 權限。請以 OTC_ALLOW_DEV_BOOTSTRAP=1 啟動 API，或手動設定 users.platform_role'
    );
  }
}

async function main() {
  console.log('E2E user management: BASE =', BASE);
  await waitHealth();
  await bootstrapPlatformAdmin(ADMIN);

  console.log('\n1) POST platform user');
  const newId = 'e2e-user-' + Date.now().toString(36);
  let { res, data } = await post(`${BASE}/api/platform/users`, ADMIN, {
    id: newId,
    displayName: 'E2E Test User',
    email: `${newId}@test.local`,
  });
  assert(res.status === 201, 'create user 201');
  assert(data.id === newId, 'created id');

  console.log('\n2) GET list paginated');
  ({ res, data } = await get(`${BASE}/api/platform/users?limit=5&offset=0`, ADMIN));
  assert(res.ok, 'list users');
  assert(Array.isArray(data.items), 'items array');
  assert(typeof data.total === 'number', 'total number');

  console.log('\n3) GET user detail');
  ({ res, data } = await get(`${BASE}/api/platform/users/${newId}`, ADMIN));
  assert(res.ok, 'get user');
  assert(data.displayName === 'E2E Test User', 'displayName');

  console.log('\n4) PATCH platform user');
  ({ res, data } = await patch(`${BASE}/api/platform/users/${newId}`, ADMIN, { displayName: 'E2E Renamed' }));
  assert(res.ok, 'patch user');
  assert(data.displayName === 'E2E Renamed', 'renamed');

  console.log('\n5) PATCH /api/me self-service');
  await ensureUser(USER_A);
  ({ res, data } = await patch(`${BASE}/api/me`, USER_A, { displayName: 'Self Updated', email: 'self@test.local' }));
  assert(res.ok, 'patch me');
  assert(data.displayName === 'Self Updated', 'self displayName');

  console.log('\n6) EMAIL_TAKEN on duplicate');
  await ensureUser(USER_B);
  ({ res } = await patch(`${BASE}/api/me`, USER_B, { email: 'self@test.local' }));
  assert(res.status === 409, 'email taken 409');

  console.log('\n7) Suspend user');
  ({ res, data } = await patch(`${BASE}/api/platform/users/${newId}`, ADMIN, { status: 'suspended' }));
  assert(res.ok, 'suspend');
  assert(data.status === 'suspended', 'suspended status');
  ({ res } = await get(`${BASE}/api/me`, newId));
  assert(res.status === 403, 'suspended cannot call API');

  console.log('\n8) Cannot suspend self');
  ({ res } = await patch(`${BASE}/api/platform/users/${ADMIN}`, ADMIN, { status: 'suspended' }));
  assert(res.status === 409, 'cannot suspend self');

  console.log('\n9) Unsuspend and DELETE');
  await patch(`${BASE}/api/platform/users/${newId}`, ADMIN, { status: 'active' });
  ({ res } = await del(`${BASE}/api/platform/users/${newId}`, ADMIN));
  assert(res.status === 204, 'delete 204');
  ({ res } = await get(`${BASE}/api/platform/users/${newId}`, ADMIN));
  assert(res.status === 404, 'deleted not found');

  console.log('\n--- E2E user management PASSED ---');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
