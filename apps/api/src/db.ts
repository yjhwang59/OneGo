import pg from 'pg';

const { Pool } = pg;

/**
 * 依 DB_TARGET 解析 DATABASE_URL
 * DB_TARGET=local → DATABASE_URL_LOCAL
 * DB_TARGET=remote → DATABASE_URL_REMOTE
 * 若未設定則 fallback 至 DATABASE_URL
 */
export function getDatabaseUrl(): string | null {
  const target = (process.env.DB_TARGET || 'local').toLowerCase();
  const url =
    target === 'remote'
      ? process.env.DATABASE_URL_REMOTE || process.env.DATABASE_URL
      : process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL;
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  return url.trim();
}

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  const url = getDatabaseUrl();
  if (!url) return null;
  if (pool) return pool;
  pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

export async function dbHealth(): Promise<{ enabled: boolean; ok: boolean; error?: string }> {
  const p = getPool();
  if (!p) return { enabled: false, ok: true };
  try {
    const r = await p.query('select 1 as ok');
    const ok = r?.rows?.[0]?.ok === 1;
    return { enabled: true, ok };
  } catch (e: any) {
    return { enabled: true, ok: false, error: e?.message ?? String(e) };
  }
}




