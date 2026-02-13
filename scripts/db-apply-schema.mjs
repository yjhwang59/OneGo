import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import pg from 'pg';

const { Client } = pg;

const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
if (!databaseUrl) {
  console.error('缺少 DATABASE_URL，請先設定環境變數再執行。');
  console.error('範例：');
  console.error('  $env:DATABASE_URL="postgres://user:pass@localhost:5432/otc?sslmode=disable"');
  process.exit(1);
}

const schemaPath = path.resolve(process.cwd(), 'db/schema/otc.sql');
if (!fs.existsSync(schemaPath)) {
  console.error(`找不到 schema 檔案：${schemaPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(schemaPath, 'utf8');
if (!sql.trim()) {
  console.error('schema 檔案是空的，無法套用。');
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

try {
  console.log('Connecting to DB...');
  await client.connect();
  console.log('Applying schema (db/schema/otc.sql)...');
  await client.query(sql);
  console.log('Done.');
} catch (err) {
  console.error('套用 schema 失敗：');
  console.error(err?.message ?? err);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}


