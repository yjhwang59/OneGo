import type { RulesPlugin } from '@otc/rules';
import type { NormalizedMatchResult } from '@otc/rules';

export type FinishedMatch = {
  playerAId: string;
  playerBId: string;
  result: NormalizedMatchResult;
};

export type StandingsRow = {
  playerId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  tiebreaks?: Record<string, number>;
};

/** 預設 tiebreak 順序：勝場數、直接勝負、對手分（Buchholz） */
export const DEFAULT_TIEBREAK_ORDER = ['wins', 'head_to_head', 'opponent_score'] as const;

/**
 * 依棋種決定 tiebreak 順序（移植自 Sched 各棋種輔分順序）。
 * - gomoku（五子）：SOS → SODOS → 彼此對戰 → 勝場
 * - go（圍棋）：SOS → 彼此對戰 → 勝場
 * - xiangqi（象棋）：SOS → 彼此對戰 → 勝場
 * - 其他（如 chess）：沿用 OneGo 既有預設
 */
export function getTiebreakOrderForGame(gameKey: string): readonly string[] {
  switch (gameKey) {
    case 'gomoku':
      return ['sos', 'sodos', 'head_to_head', 'wins'];
    case 'go':
    case 'xiangqi':
      return ['sos', 'head_to_head', 'wins'];
    default:
      return DEFAULT_TIEBREAK_ORDER;
  }
}

function computeBaseStandings(args: {
  participants: string[];
  matches: FinishedMatch[];
  rules: RulesPlugin;
}): StandingsRow[] {
  const rows = new Map<string, StandingsRow>();
  for (const pid of args.participants) {
    rows.set(pid, { playerId: pid, played: 0, wins: 0, draws: 0, losses: 0, points: 0, tiebreaks: {} });
  }

  for (const m of args.matches) {
    const r = m.result;
    const score = args.rules.scoreMatch({ result: r });
    const a = rows.get(m.playerAId);
    const b = rows.get(m.playerBId);
    if (a) {
      a.played += 1;
      a.points += score.A.points;
      if (r.kind === 'win') a[r.winner === 'A' ? 'wins' : 'losses'] += 1;
      if (r.kind === 'draw') a.draws += 1;
    }
    if (b) {
      b.played += 1;
      b.points += score.B.points;
      if (r.kind === 'win') b[r.winner === 'B' ? 'wins' : 'losses'] += 1;
      if (r.kind === 'draw') b.draws += 1;
    }
  }

  return [...rows.values()];
}

/**
 * 對手分（Buchholz / SOS）：該選手所有對手的積分總和。
 * 同時寫入 `opponent_score`（相容既有）與 `sos`（Sched 輔一命名）。
 */
function applyOpponentScore(rows: StandingsRow[], matches: FinishedMatch[], pointsMap: Map<string, number>): void {
  for (const row of rows) {
    const opponents = matches
      .filter((m) => m.playerAId === row.playerId || m.playerBId === row.playerId)
      .map((m) => (m.playerAId === row.playerId ? m.playerBId : m.playerAId));
    const opponentScore = opponents.reduce((sum, oppId) => sum + (pointsMap.get(oppId) ?? 0), 0);
    if (!row.tiebreaks) row.tiebreaks = {};
    row.tiebreaks.opponent_score = opponentScore;
    row.tiebreaks.sos = opponentScore;
  }
}

/**
 * SODOS（Sched 輔二）：所勝對手總分 + 所和對手總分×0.5。
 * 以「該局己方得分 / 單局最高分」為權重（win→1、draw→0.5、loss→0），乘上對手總分後累加。
 */
function applySodos(rows: StandingsRow[], matches: FinishedMatch[], rules: RulesPlugin, pointsMap: Map<string, number>): void {
  const sodos = new Map<string, number>(rows.map((r) => [r.playerId, 0]));
  for (const m of matches) {
    const score = rules.scoreMatch({ result: m.result });
    const total = score.A.points + score.B.points; // 單局最高分（win/draw 皆為滿分；void=0）
    if (total <= 0) continue;
    const oppA = pointsMap.get(m.playerBId) ?? 0;
    const oppB = pointsMap.get(m.playerAId) ?? 0;
    if (sodos.has(m.playerAId)) sodos.set(m.playerAId, sodos.get(m.playerAId)! + (score.A.points / total) * oppA);
    if (sodos.has(m.playerBId)) sodos.set(m.playerBId, sodos.get(m.playerBId)! + (score.B.points / total) * oppB);
  }
  for (const row of rows) {
    if (!row.tiebreaks) row.tiebreaks = {};
    row.tiebreaks.sodos = sodos.get(row.playerId) ?? 0;
  }
}

/**
 * 彼此對戰成績（Sched 輔三）：同分（points 相同）者之間對戰得分；
 * 若同分組內對戰無法形成單一連通，則整組此輔分為 0。
 * 每局計 `己方得分 −（單局最高分/2）`（win→+半分、draw→0、loss→−半分）。
 */
function applyHeadToHead(rows: StandingsRow[], matches: FinishedMatch[], rules: RulesPlugin): void {
  const value = new Map<string, number>(rows.map((r) => [r.playerId, 0]));

  // 依 points 分同分組
  const groups = new Map<number, string[]>();
  for (const r of rows) {
    if (!groups.has(r.points)) groups.set(r.points, []);
    groups.get(r.points)!.push(r.playerId);
  }

  for (const ids of groups.values()) {
    if (ids.length <= 1) continue;
    const idSet = new Set(ids);
    // 建組內鄰接圖並檢查單一連通
    const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
    for (const m of matches) {
      if (idSet.has(m.playerAId) && idSet.has(m.playerBId)) {
        adj.get(m.playerAId)!.push(m.playerBId);
        adj.get(m.playerBId)!.push(m.playerAId);
      }
    }
    const visited = new Set<string>([ids[0]!]);
    const queue = [ids[0]!];
    while (queue.length > 0) {
      const u = queue.shift()!;
      for (const v of adj.get(u)!) {
        if (!visited.has(v)) {
          visited.add(v);
          queue.push(v);
        }
      }
    }
    if (visited.size !== ids.length) continue; // 非單一連通 → 該組維持 0

    for (const m of matches) {
      if (!idSet.has(m.playerAId) || !idSet.has(m.playerBId)) continue;
      const score = rules.scoreMatch({ result: m.result });
      const half = (score.A.points + score.B.points) / 2;
      value.set(m.playerAId, value.get(m.playerAId)! + (score.A.points - half));
      value.set(m.playerBId, value.get(m.playerBId)! + (score.B.points - half));
    }
  }

  for (const row of rows) {
    if (!row.tiebreaks) row.tiebreaks = {};
    row.tiebreaks.head_to_head = value.get(row.playerId) ?? 0;
  }
}

/** 勝場數已存在於 row.wins，僅確保 tiebreaks.wins */
function applyWinsTiebreak(rows: StandingsRow[]): void {
  for (const row of rows) {
    if (!row.tiebreaks) row.tiebreaks = {};
    row.tiebreaks.wins = row.wins;
  }
}

export function computeStandings(args: {
  participants: string[];
  matches: FinishedMatch[];
  rules: RulesPlugin;
  tiebreakOrder?: readonly string[];
}): StandingsRow[] {
  const order = args.tiebreakOrder ?? DEFAULT_TIEBREAK_ORDER;
  const rows = computeBaseStandings(args);
  const pointsMap = new Map(rows.map((s) => [s.playerId, s.points]));

  applyWinsTiebreak(rows);
  applyHeadToHead(rows, args.matches, args.rules);
  applyOpponentScore(rows, args.matches, pointsMap);
  applySodos(rows, args.matches, args.rules, pointsMap);

  return rows.sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    for (const key of order) {
      const tx = x.tiebreaks?.[key] ?? (key === 'wins' ? x.wins : 0);
      const ty = y.tiebreaks?.[key] ?? (key === 'wins' ? y.wins : 0);
      if (ty !== tx) return ty - tx;
    }
    return 0;
  });
}

export function computePublicPoints(args: { matches: FinishedMatch[]; rules: RulesPlugin }): Array<{ playerId: string; points: number }> {
  const points = new Map<string, number>();
  for (const m of args.matches) {
    const score = args.rules.scoreMatch({ result: m.result });
    points.set(m.playerAId, (points.get(m.playerAId) ?? 0) + score.A.points);
    points.set(m.playerBId, (points.get(m.playerBId) ?? 0) + score.B.points);
  }
  return [...points.entries()].map(([playerId, points]) => ({ playerId, points })).sort((a, b) => b.points - a.points);
}




