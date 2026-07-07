import process from 'node:process';

import pg from 'pg';

import { resolveDatabaseUrl } from './resolve-db-url.mjs';

/**
 * 一鍵設定／解除「平台總管」(platform_admin)，免手動 SQL。
 *
 * 用法（會自動讀取 .env）：
 *   npm run grant:admin -- <userId>            # 設為 platform_admin
 *   npm run grant:admin -- <userId> --revoke   # 解除
 *
 * 若使用者不存在，會自動建立一個最小帳號後再授權。
 */

const args = process.argv.slice(2);
const revoke = args.includes('--revoke');
const userId = args.find((a) => !a.startsWith('--'))?.trim();

if (!userId) {
  console.error('用法：npm run grant:admin -- <userId> [--revoke]');
  process.exit(1);
}

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  console.error('缺少 DATABASE_URL，請先設定 .env（DB_TARGET 及對應 DATABASE_URL_LOCAL / DATABASE_URL_REMOTE）。');
  process.exit(1);
}

const { Client } = pg;
const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  // 確保使用者存在（不存在則建立最小帳號）
  const existing = await client.query('SELECT id, platform_role FROM users WHERE id = $1', [userId]);
  if (existing.rows.length === 0) {
    if (revoke) {
      console.error(`找不到使用者 ${userId}，無需解除。`);
      process.exit(1);
    }
    await client.query(
      'INSERT INTO users (id, display_name, created_at, updated_at) VALUES ($1, $2, now(), now())',
      [userId, `User-${userId.slice(0, 6)}`]
    );
    console.log(`已建立使用者 ${userId}`);
  }
  const nextRole = revoke ? null : 'platform_admin';
  await client.query('UPDATE users SET platform_role = $1, updated_at = now() WHERE id = $2', [nextRole, userId]);
  console.log(revoke ? `已解除 ${userId} 的平台總管權限。` : `已將 ${userId} 設為平台總管（platform_admin）。`);
} catch (err) {
  console.error('操作失敗：', err?.message ?? err);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
