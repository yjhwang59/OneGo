/**
 * 依 DB_TARGET 解析 DATABASE_URL
 * DB_TARGET=local → DATABASE_URL_LOCAL
 * DB_TARGET=remote → DATABASE_URL_REMOTE
 * 若未設定則 fallback 至 DATABASE_URL
 */
export function resolveDatabaseUrl() {
  const target = (process.env.DB_TARGET || 'local').toLowerCase();
  const url =
    target === 'remote'
      ? process.env.DATABASE_URL_REMOTE || process.env.DATABASE_URL
      : process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL;
  return (url ?? '').trim();
}
