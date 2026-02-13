import pg from 'pg';

const { Pool } = pg;

export function getDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (typeof url !== 'string') return null;
  if (!url.trim()) return null;
  return url.trim();
}

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  const url = getDatabaseUrl();
  if (!url) return null;
  if (pool) return pool;
  pool = new Pool({ connectionString: url });
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




