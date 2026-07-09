import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import pg from 'pg';

import { resolveDatabaseUrl } from './resolve-db-url.mjs';

const { Client } = pg;

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  console.error('缺少 DATABASE_URL，請先設定 .env 或環境變數。');
  console.error('需設定 DB_TARGET (local|remote) 及對應的 DATABASE_URL_LOCAL / DATABASE_URL_REMOTE');
  console.error('建議：在專案根目錄執行 npm run db:apply（會自動讀取 .env）');
  process.exit(1);
}

// 依序套用（後者可依賴前者建立的 type/table）
const schemaFiles = ['db/schema/otc.sql', 'db/schema/rating.sql', 'db/schema/official-results.sql'];

const client = new Client({ connectionString: databaseUrl });

try {
  console.log('Connecting to DB...');
  await client.connect();
  for (const rel of schemaFiles) {
    const p = path.resolve(process.cwd(), rel);
    if (!fs.existsSync(p)) {
      if (rel.endsWith('otc.sql')) { console.error(`找不到 schema 檔案：${p}`); process.exit(1); }
      console.log(`（略過不存在的 ${rel}）`);
      continue;
    }
    const sql = fs.readFileSync(p, 'utf8');
    if (!sql.trim()) { console.log(`（略過空檔 ${rel}）`); continue; }
    console.log(`Applying schema (${rel})...`);
    await client.query(sql);
  }
  console.log('Done.');
} catch (err) {
  console.error('套用 schema 失敗：');
  console.error(err?.message ?? err);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}


