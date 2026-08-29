import type { DataSource } from './data';
import type { Match, Registration, Tournament, User } from './store';
import type { NormalizedMatchResult } from '@otc/rules';
import { getRulesPlugin } from './rules';
import {
  computeScoresheetWithRules,
  type ScoringEntry,
  type ScoresheetRow,
} from '@otc/scoring';

function normalizeGroupKey(key?: string | null): string | undefined {
  const t = key?.trim();
  return t ? t : undefined;
}

/** 將 Match 轉成 ScoringEntry（含輪空給分） */
export function matchToEntries(
  m: Match,
  winPoint: number,
  byePoint: number
): ScoringEntry[] {
  const kind = m.entryKind ?? 'normal';
  if (kind === 'bye' || !m.playerBId) {
    const score =
      m.result?.kind === 'win' ? byePoint : m.result ? 0 : byePoint;
    return [
      {
        playerId: m.playerAId,
        roundNo: m.roundNo,
        kind: 'bye',
        score: m.status === 'finished' ? score : undefined,
      },
    ];
  }
  if (kind === 'absent') {
    return [
      {
        playerId: m.playerAId,
        roundNo: m.roundNo,
        kind: 'absent',
        score: m.status === 'finished' ? 0 : undefined,
      },
    ];
  }
  if (!m.result || m.status !== 'finished') {
    return [
      {
        playerId: m.playerAId,
        roundNo: m.roundNo,
        opponentId: m.playerBId,
        kind: 'normal',
        isFirstMove: m.firstMove === 'A' ? true : m.firstMove === 'B' ? false : undefined,
      },
      {
        playerId: m.playerBId,
        roundNo: m.roundNo,
        opponentId: m.playerAId,
        kind: 'normal',
        isFirstMove: m.firstMove === 'B' ? true : m.firstMove === 'A' ? false : undefined,
      },
    ];
  }
  // 需要 rules 計分；此處用結果推分數由呼叫端帶入 rules
  return [];
}

export function matchToScoredEntries(
  m: Match,
  scoreA: number,
  scoreB: number | undefined
): ScoringEntry[] {
  const kind = m.entryKind ?? 'normal';
  if (kind === 'bye' || !m.playerBId) {
    return [
      {
        playerId: m.playerAId,
        roundNo: m.roundNo,
        kind: 'bye',
        score: scoreA,
      },
    ];
  }
  return [
    {
      playerId: m.playerAId,
      roundNo: m.roundNo,
      opponentId: m.playerBId,
      kind: 'normal',
      score: scoreA,
      isFirstMove: m.firstMove === 'A' ? true : m.firstMove === 'B' ? false : undefined,
    },
    {
      playerId: m.playerBId!,
      roundNo: m.roundNo,
      opponentId: m.playerAId,
      kind: 'normal',
      score: scoreB ?? 0,
      isFirstMove: m.firstMove === 'B' ? true : m.firstMove === 'A' ? false : undefined,
    },
  ];
}

export type ScoresheetPlayer = {
  playerId: string;
  displayName: string;
  seedNo: number | null;
  categoryKey: string | null;
  withdrawn: boolean;
};

export type ScoresheetCell = {
  matchId: string;
  side: 'A' | 'B';
  opponentSeedNo: number | null;
  opponentId: string | null;
  score: number | null;
  firstMove: boolean;
  memo: string | null;
  status: string;
};

export type ScoresheetPayload = {
  tournament: {
    id: string;
    name: string;
    gameKey: string;
    status: string;
    roundCount: number;
    winPoint: number;
    byePoint: number;
    sosKeepTop: number | null;
  };
  categoryKey: string | null;
  rounds: number[];
  players: ScoresheetPlayer[];
  /** playerId -> roundNo -> cell */
  cells: Record<string, Record<number, ScoresheetCell>>;
  rows: ScoresheetRow[];
  tiebreakSpec: Array<{ id: string; label: string; tip: string; direction?: string }>;
  usedTiebreakCount: number;
};

export async function buildScoresheet(
  data: DataSource,
  t: Tournament,
  filterCategoryKey?: string | null
): Promise<ScoresheetPayload> {
  const rules = getRulesPlugin({ gameKey: t.gameKey, rulesetVersion: t.rulesetVersion });
  if (!rules) throw new Error('UNSUPPORTED_RULESET');

  const winPoint = t.winPoint ?? rules.defaultWinPoint;
  const byePoint = t.byePoint ?? winPoint;
  const filter = normalizeGroupKey(filterCategoryKey);

  const regs = (await data.registrations.listByTournamentId(t.id)).filter(
    (r) => r.status !== 'cancelled'
  );
  const regIds = regs.map((r) => r.id);
  const checkedInIds = await data.checkins.listCheckedInRegistrationIds(regIds);
  const checkins = await data.checkins.listByRegistrationIds(regIds);
  const withdrawnIds = new Set(
    checkins.filter((c) => c.status === 'withdrawn').map((c) => c.registrationId)
  );

  let activeRegs = regs.filter((r) => checkedInIds.has(r.id) || withdrawnIds.has(r.id));
  if (filter !== undefined) {
    activeRegs = activeRegs.filter((r) => normalizeGroupKey(r.categoryKey) === filter);
  }

  const users = new Map<string, User>();
  for (const r of activeRegs) {
    const u = await data.users.get(r.userId);
    if (u) users.set(u.id, u);
  }

  const players: ScoresheetPlayer[] = activeRegs.map((r) => ({
    playerId: r.userId,
    displayName: users.get(r.userId)?.displayName ?? r.userId,
    seedNo: r.seedNo ?? null,
    categoryKey: r.categoryKey ?? null,
    withdrawn: withdrawnIds.has(r.id),
  }));

  const matches = (await data.matches.listByTournamentId(t.id)).filter((m) => {
    if (filter === undefined) return true;
    return normalizeGroupKey(m.categoryKey) === filter;
  });

  const seedByPlayer = new Map(players.map((p) => [p.playerId, p.seedNo]));
  const cells: ScoresheetPayload['cells'] = {};
  const entries: ScoringEntry[] = [];
  const roundSet = new Set<number>();

  for (const m of matches) {
    roundSet.add(m.roundNo);
    const kind = m.entryKind ?? 'normal';

    if (kind === 'bye' || !m.playerBId) {
      const score =
        m.status === 'finished' ? (m.result?.kind === 'win' ? byePoint : 0) : null;
      if (!cells[m.playerAId]) cells[m.playerAId] = {};
      cells[m.playerAId]![m.roundNo] = {
        matchId: m.id,
        side: 'A',
        opponentSeedNo: null,
        opponentId: null,
        score,
        firstMove: false,
        memo: '輪空',
        status: m.status,
      };
      if (score != null) {
        entries.push({
          playerId: m.playerAId,
          roundNo: m.roundNo,
          kind: 'bye',
          score,
        });
      }
      continue;
    }

    let scoreA: number | null = null;
    let scoreB: number | null = null;
    if (m.status === 'finished' && m.result) {
      const sc = rules.scoreMatch({ result: m.result, winPoint });
      scoreA = sc.A.points;
      scoreB = sc.B.points;
      entries.push(...matchToScoredEntries(m, scoreA, scoreB));
    }

    if (!cells[m.playerAId]) cells[m.playerAId] = {};
    if (!cells[m.playerBId]) cells[m.playerBId] = {};
    cells[m.playerAId]![m.roundNo] = {
      matchId: m.id,
      side: 'A',
      opponentSeedNo: seedByPlayer.get(m.playerBId) ?? null,
      opponentId: m.playerBId,
      score: scoreA,
      firstMove: m.firstMove === 'A',
      memo: null,
      status: m.status,
    };
    cells[m.playerBId]![m.roundNo] = {
      matchId: m.id,
      side: 'B',
      opponentSeedNo: seedByPlayer.get(m.playerAId) ?? null,
      opponentId: m.playerAId,
      score: scoreB,
      firstMove: m.firstMove === 'B',
      memo: null,
      status: m.status,
    };
  }

  const fouls = await data.scoring.listFoulsByTournament(t.id);
  const foulCounts: Record<string, number> = {};
  for (const f of fouls) {
    foulCounts[f.playerId] = (foulCounts[f.playerId] ?? 0) + 1;
  }
  const adjustments = await data.scoring.listAdjustments(t.id);
  const adjMap: Record<string, number> = {};
  for (const a of adjustments) {
    adjMap[a.playerId] = (adjMap[a.playerId] ?? 0) + a.delta;
  }

  const sheet = computeScoresheetWithRules({
    participants: players.map((p) => ({
      playerId: p.playerId,
      seedNo: p.seedNo ?? undefined,
      withdrawn: p.withdrawn,
    })),
    entries,
    rules,
    winPoint,
    sosKeepTop: t.sosKeepTop,
    roundCount: t.roundCount,
    adjustments: adjMap,
    foulCounts,
  });

  const rounds = [...roundSet].sort((a, b) => a - b);
  if (rounds.length === 0) {
    for (let i = 1; i <= t.roundCount; i++) rounds.push(i);
  }

  return {
    tournament: {
      id: t.id,
      name: t.name,
      gameKey: t.gameKey,
      status: t.status,
      roundCount: t.roundCount,
      winPoint,
      byePoint,
      sosKeepTop: t.sosKeepTop ?? null,
    },
    categoryKey: filter ?? null,
    rounds,
    players,
    cells,
    rows: sheet.rows,
    tiebreakSpec: sheet.tiebreakSpec.map((s) => ({
      id: s.id,
      label: s.label,
      tip: s.tip,
      direction: s.direction,
    })),
    usedTiebreakCount: sheet.usedTiebreakCount,
  };
}

export function resultFromCycleScore(
  scoreA: number,
  scoreB: number,
  winPoint: number
): NormalizedMatchResult {
  if (scoreA >= winPoint - 1e-9 && scoreB <= 1e-9) return { kind: 'win', winner: 'A' };
  if (scoreB >= winPoint - 1e-9 && scoreA <= 1e-9) return { kind: 'win', winner: 'B' };
  if (Math.abs(scoreA - scoreB) < 1e-9) return { kind: 'draw' };
  // 非標準分差：仍以較高分方為勝
  return scoreA > scoreB ? { kind: 'win', winner: 'A' } : { kind: 'win', winner: 'B' };
}

/** 抽籤：為已報到者依組別亂數分配 seedNo */
export async function drawSeeds(
  data: DataSource,
  tournamentId: string
): Promise<Registration[]> {
  const regs = (await data.registrations.listByTournamentId(tournamentId)).filter(
    (r) => r.status !== 'cancelled'
  );
  const regIds = regs.map((r) => r.id);
  const checkedIn = await data.checkins.listCheckedInRegistrationIds(regIds);
  const active = regs.filter((r) => checkedIn.has(r.id));

  const byGroup = new Map<string, Registration[]>();
  for (const r of active) {
    const g = normalizeGroupKey(r.categoryKey) ?? '__default__';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(r);
  }

  const updated: Registration[] = [];
  for (const list of byGroup.values()) {
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      const r = await data.registrations.updateSeedNo(shuffled[i]!.id, i + 1);
      if (r) updated.push(r);
    }
  }
  return updated;
}
