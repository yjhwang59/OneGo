import process from 'node:process';
import pg from 'pg';

const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
if (!databaseUrl) {
  console.error('缺少 DATABASE_URL');
  process.exit(1);
}

const { Client } = pg;
const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  const r = await client.query('select 1 as ok');
  console.log(JSON.stringify({ ok: true, dbOk: r.rows?.[0]?.ok === 1 }, null, 2));
} catch (err) {
  console.error('DB 連線失敗：');
  console.error(err);
  console.error(err?.message ?? String(err));
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}


