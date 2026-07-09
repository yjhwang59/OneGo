#!/usr/bin/env node
/**
 * 匯入「2025 XYZ圍棋公開賽」分組戰績（來源：docs/data/anonymized_group_results.csv）
 *
 * 依使用者確認的決策：
 *  1. 棋手以匿名代碼當顯示名；user id 以 (組別+代碼) 命名空間化（處理跨組撞碼 P090/P146）。
 *  2. 新建主辦單位，擁有者 = yjhwang。
 *  3. 賽事名稱：2025 XYZ圍棋公開賽（1 個賽事 + 19 個組別 category）。
 *  4. 輪空(空)/棄權(棄) 不建立 match。
 *  5. 官方名次/輔分/升段/加賽/勝場 存入 tournament_official_results 表。
 *  6. 直接寫入本機 PostgreSQL（DATABASE_URL_LOCAL）。
 *
 * 冪等：若同主辦同名賽事已存在，先刪除該賽事（cascade 清掉其 categories/registrations/matches/official_results），再重建。
 * 棋手 user 以 upsert 方式建立（id 已對本賽事命名空間化，不影響其他賽事）。
 *
 * 執行：node scripts/import-xyz-2025.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import pg from 'pg';
import { resolveDatabaseUrl } from './resolve-db-url.mjs';

const OWNER_ID = 'yjhwang';
const OWNER_NAME = 'yjhwang';
const ORG_NAME = 'XYZ圍棋';
const ORG_SLUG = 'xyz';
const T_NAME = '2025 XYZ圍棋公開賽';
const T_TIMEZONE = 'Asia/Taipei';
const ROUND_COUNT = 6;
const ID_NS = 'xyz2025';
const CSV = 'docs/data/anonymized_group_results.csv';

// ---- CSV 欄位索引 ----
const C = {
  group: 2, seed: 4, code: 5,
  tb1: 6, tb2: 7, tb3: 8, tb4: 9,
  rank: 10, note: 11, promote: 12,
  roundStart: 13, // (opp,res) x6 → 13..24
  wins: 25,
};

function num(v) { const s = (v ?? '').trim(); if (s === '') return null; const n = Number(s); return Number.isFinite(n) ? n : null; }

function parseCsv() {
  const lines = fs.readFileSync(path.resolve(process.cwd(), CSV), 'utf8').split(/\r?\n/).filter(Boolean);
  lines.shift();
  const rows = lines.map((l) => l.split(','));
  const groupsOrder = [];
  const groups = new Map();
  for (const r of rows) {
    const g = r[C.group];
    if (!groups.has(g)) { groups.set(g, []); groupsOrder.push(g); }
    groups.get(g).push(r);
  }
  return { groups, groupsOrder };
}

function userId(group, code) { return `${ID_NS}:${group}:${code}`; }

async function main() {
  const url = resolveDatabaseUrl();
  if (!url) { console.error('缺少 DATABASE_URL（請設定 .env）'); process.exit(1); }
  const { groups, groupsOrder } = parseCsv();

  // 先在 JS 端建構所有要寫入的資料，並做一致性驗證
  const players = []; // {group, seed, code, uid, rank, tb, wins, playoff, promote}
  const matches = []; // {group, round, aSeed, bSeed, winnerSeed}
  const byUid = new Set();
  let byes = 0, forfeits = 0;

  for (const g of groupsOrder) {
    const list = groups.get(g);
    const bySeed = new Map();
    for (const r of list) bySeed.set(r[C.seed], r);
    for (const r of list) {
      const seed = r[C.seed];
      const code = r[C.code];
      const uid = userId(g, code);
      if (byUid.has(uid)) throw new Error(`重複 user id：${uid}（同組同代碼）`);
      byUid.add(uid);
      players.push({
        group: g, seed: Number(seed), code, uid,
        rank: num(r[C.rank]),
        tb: [num(r[C.tb1]), num(r[C.tb2]), num(r[C.tb3]), num(r[C.tb4])],
        wins: num(r[C.wins]),
        playoff: (r[C.note] || '').includes('加賽'),
        promote: (r[C.promote] || '').trim() || null,
      });
      // rounds
      for (let k = 0; k < 6; k++) {
        const opp = r[C.roundStart + k * 2];
        const res = r[C.roundStart + k * 2 + 1];
        if (opp === undefined || opp === '') continue;
        if (opp === '空') { byes++; continue; }
        if (opp === '棄') { forfeits++; continue; }
        const m = opp.match(/^(\d+)([↑↓]?)$/);
        if (!m) throw new Error(`無法解析對手：${g} seed${seed} r${k + 1} = "${opp}"`);
        const oppSeed = Number(m[1]);
        if (!bySeed.has(String(oppSeed))) throw new Error(`找不到對手 seed：${g} ${oppSeed}`);
        // 一致性：對手該輪必須回指本人、且結果相反
        const or = bySeed.get(String(oppSeed));
        const oOpp = (or[C.roundStart + k * 2] || '').match(/^(\d+)/);
        const oRes = or[C.roundStart + k * 2 + 1];
        if (!oOpp || Number(oOpp[1]) !== Number(seed)) throw new Error(`對局不對稱：${g} ${seed}<->${oppSeed} r${k + 1}`);
        if (!((res === 'O' && oRes === 'X') || (res === 'X' && oRes === 'O'))) throw new Error(`結果不相反：${g} ${seed}/${oppSeed} r${k + 1} = ${res}/${oRes}`);
        // 去重：只在 seed < oppSeed 的方向建立
        if (Number(seed) < oppSeed) {
          matches.push({ group: g, round: k + 1, aSeed: Number(seed), bSeed: oppSeed, winnerSeed: res === 'O' ? Number(seed) : oppSeed });
        }
      }
    }
  }

  console.log(`解析完成：棋手 ${players.length}、對局 ${matches.length}、輪空 ${byes}、棄權 ${forfeits}、組別 ${groupsOrder.length}`);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('begin');

    // 0) 確保官方成績表存在
    await client.query(fs.readFileSync(path.resolve(process.cwd(), 'db/schema/official-results.sql'), 'utf8'));

    // 1) owner user
    await client.query(
      `insert into users (id, display_name) values ($1,$2)
       on conflict (id) do update set display_name = excluded.display_name`,
      [OWNER_ID, OWNER_NAME]
    );

    // 2) organization（依 slug 冪等）
    let org = (await client.query('select id from organizations where slug=$1', [ORG_SLUG])).rows[0];
    if (!org) {
      org = (await client.query('insert into organizations (name, slug) values ($1,$2) returning id', [ORG_NAME, ORG_SLUG])).rows[0];
    }
    const orgId = org.id;
    await client.query(
      `insert into organization_memberships (organization_id, user_id, role) values ($1,$2,'owner')
       on conflict (organization_id, user_id) do nothing`,
      [orgId, OWNER_ID]
    );

    // 3) 若同名賽事已存在 → 刪除（cascade），再重建
    const existing = await client.query('select id from tournaments where organization_id=$1 and name=$2', [orgId, T_NAME]);
    for (const row of existing.rows) {
      await client.query('delete from tournaments where id=$1', [row.id]);
    }
    const tournamentId = randomUUID();
    await client.query(
      `insert into tournaments (id, organization_id, name, game_key, ruleset_version, timezone, format, round_count, status)
       values ($1,$2,$3,'go','v1',$4,'swiss',$5,'closed')`,
      [tournamentId, orgId, T_NAME, T_TIMEZONE, ROUND_COUNT]
    );

    // 4) categories（key = display_name = 組別；sort_order 依 CSV 首次出現序）
    for (let i = 0; i < groupsOrder.length; i++) {
      const g = groupsOrder[i];
      await client.query(
        `insert into tournament_categories (tournament_id, key, display_name, sort_order) values ($1,$2,$3,$4)`,
        [tournamentId, g, g, i]
      );
    }

    // 5) users（upsert）+ registrations + official_results
    const regIdByUid = new Map();
    for (const p of players) {
      await client.query(
        `insert into users (id, display_name) values ($1,$2)
         on conflict (id) do update set display_name = excluded.display_name`,
        [p.uid, p.code]
      );
      const regId = randomUUID();
      regIdByUid.set(p.uid, regId);
      await client.query(
        `insert into registrations (id, tournament_id, user_id, status, category_key)
         values ($1,$2,$3,'paid',$4)`,
        [regId, tournamentId, p.uid, p.group]
      );
      await client.query(
        `insert into tournament_official_results
           (tournament_id, registration_id, category_key, seed_no, anon_code, final_rank, tiebreak1, tiebreak2, tiebreak3, tiebreak4, wins, is_playoff, promoted_to)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [tournamentId, regId, p.group, p.seed, p.code, p.rank, p.tb[0], p.tb[1], p.tb[2], p.tb[3], p.wins, p.playoff, p.promote]
      );
    }

    // 6) matches
    const codeByGroupSeed = new Map();
    for (const p of players) codeByGroupSeed.set(`${p.group}:${p.seed}`, p.code);
    for (const m of matches) {
      const aUid = userId(m.group, codeByGroupSeed.get(`${m.group}:${m.aSeed}`));
      const bUid = userId(m.group, codeByGroupSeed.get(`${m.group}:${m.bSeed}`));
      const winner = m.winnerSeed === m.aSeed ? 'A' : 'B';
      await client.query(
        `insert into matches (tournament_id, round_no, category_key, player_a_id, player_b_id, status, result, finished_at)
         values ($1,$2,$3,$4,$5,'finished',$6::jsonb, now())`,
        [tournamentId, m.round, m.group, aUid, bUid, JSON.stringify({ kind: 'win', winner })]
      );
    }

    await client.query('commit');
    console.log('匯入成功。');
    console.log('  tournamentId =', tournamentId);
    console.log('  organizationId =', orgId, `(${ORG_NAME} / ${ORG_SLUG})`);
    console.log(`  categories = ${groupsOrder.length}, registrations = ${players.length}, matches = ${matches.length}`);
  } catch (e) {
    await client.query('rollback').catch(() => {});
    console.error('匯入失敗，已 rollback：', e.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main();
