#!/usr/bin/env node
import pg from 'pg';
import { resolveDatabaseUrl } from './resolve-db-url.mjs';

const url = resolveDatabaseUrl();
if (!url) {
  console.error('missing database url');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const tournaments = await client.query(
    `select t.id, t.name, t.status, t.format, t.round_count, o.name as org
       from tournaments t
       join organizations o on o.id = t.organization_id
      where t.name ilike '%XYZ%' or o.name ilike '%XYZ%'
      order by t.created_at desc`
  );
  console.log('tournaments');
  console.log(JSON.stringify(tournaments.rows, null, 2));

  for (const t of tournaments.rows) {
    const matchStats = await client.query(
      `select count(*)::int as total,
              count(*) filter (where status = 'finished')::int as finished,
              count(*) filter (where result is not null)::int as has_result,
              min(round_no)::int as min_round,
              max(round_no)::int as max_round
         from matches
        where tournament_id = $1`,
      [t.id]
    );
    const byRound = await client.query(
      `select round_no,
              count(*)::int as total,
              count(*) filter (where status = 'finished')::int as finished,
              count(*) filter (where result is not null)::int as has_result
         from matches
        where tournament_id = $1
        group by round_no
        order by round_no`,
      [t.id]
    );
    const regs = await client.query(
      `select count(*)::int as total,
              count(*) filter (where status = 'paid')::int as paid
         from registrations
        where tournament_id = $1`,
      [t.id]
    );
    const checkins = await client.query(
      `select count(*)::int as total,
              count(*) filter (where ci.status = 'checked_in')::int as checked_in
         from checkins ci
         join registrations r on r.id = ci.registration_id
        where r.tournament_id = $1`,
      [t.id]
    );
    const cats = await client.query(
      `select count(*)::int as categories
         from tournament_categories
        where tournament_id = $1`,
      [t.id]
    );
    let official = null;
    try {
      const officialQ = await client.query(
        `select count(*)::int as official_results
           from tournament_official_results
          where tournament_id = $1`,
        [t.id]
      );
      official = officialQ.rows[0];
    } catch (error) {
      official = { error: error.message };
    }
    const sampleMatches = await client.query(
      `select id, round_no, category_key, player_a_id, player_b_id, status, result
         from matches
        where tournament_id = $1
        order by round_no, category_key, id
        limit 10`,
      [t.id]
    );

    console.log('summary');
    console.log(JSON.stringify({
      tournament: t,
      matchStats: matchStats.rows[0],
      byRound: byRound.rows,
      registrations: regs.rows[0],
      checkins: checkins.rows[0],
      categories: cats.rows[0],
      official,
      sampleMatches: sampleMatches.rows,
    }, null, 2));
  }
} finally {
  await client.end();
}
