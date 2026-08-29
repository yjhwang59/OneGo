#!/usr/bin/env node
import pg from 'pg';
import { resolveDatabaseUrl } from './resolve-db-url.mjs';

const T_NAME = '2025 XYZ圍棋公開賽';
const SIMULATED_CHECKIN_AT = '2025-12-28T08:00:00+08:00';

const url = resolveDatabaseUrl();
if (!url) {
  console.error('缺少 DATABASE_URL（請設定 .env）');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query('begin');
  const tournament = await client.query('select id from tournaments where name = $1', [T_NAME]);
  if (tournament.rows.length === 0) throw new Error(`找不到賽事：${T_NAME}`);
  const tournamentId = tournament.rows[0].id;

  const before = await client.query(
    `select count(r.*)::int as registrations,
            count(ci.*)::int as checkins
       from registrations r
       left join checkins ci on ci.registration_id = r.id
      where r.tournament_id = $1`,
    [tournamentId]
  );

  const fixed = await client.query(
    `insert into checkins (registration_id, status, checked_in_at)
     select r.id, 'checked_in', $2::timestamptz
       from registrations r
       left join checkins ci on ci.registration_id = r.id
      where r.tournament_id = $1
     on conflict (registration_id) do update set
       status = 'checked_in',
       checked_in_at = excluded.checked_in_at,
       updated_at = now()`,
    [tournamentId, SIMULATED_CHECKIN_AT]
  );

  const after = await client.query(
    `select count(r.*)::int as registrations,
            count(ci.*)::int as checkins
       from registrations r
       left join checkins ci on ci.registration_id = r.id
      where r.tournament_id = $1`,
    [tournamentId]
  );

  await client.query('commit');
  console.log(JSON.stringify({
    tournamentId,
    simulatedCheckinAt: SIMULATED_CHECKIN_AT,
    before: before.rows[0],
    insertedOrUpdated: fixed.rowCount,
    after: after.rows[0],
  }, null, 2));
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
