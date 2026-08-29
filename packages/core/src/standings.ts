import type { NormalizedMatchResult, RulesPlugin, TiebreakSpec } from '@otc/rules';
import {
  computeScoresheet,
  entriesFromNormalizedMatches,
  type ScoresheetRow,
} from '@otc/scoring';

export type FinishedMatch = {
  playerAId: string;
  playerBId: string;
  result: NormalizedMatchResult;
  firstMove?: 'A' | 'B';
  roundNo?: number;
};

export type StandingsRow = {
  playerId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  tiebreaks?: Record<string, number>;
  rank?: number;
};

/** 預設 tiebreak 順序：勝場數、直接勝負、對手分（Buchholz） */
export const DEFAULT_TIEBREAK_ORDER = ['wins', 'head_to_head', 'opponent_score'] as const;

/**
 * 依棋種決定 tiebreak 順序（對齊 packages/rules 的 tiebreakSpec）。
 * 回傳字串陣列以維持既有 API；`opponent_score` 為 `sos` 的別名。
 */
export function getTiebreakOrderForGame(gameKey: string): readonly string[] {
  switch (gameKey) {
    case 'gomoku':
      return [
        'sos',
        'sodos',
        'head_to_head',
        'sosos',
        'sodos_of_sodos',
        'sosos_weighted',
        'sodos_of_sodos_weighted',
      ];
    case 'xiangqi':
      return ['sos', 'head_to_head', 'wins', 'second_wins', 'second_games', 'sosos', 'fouls_asc'];
    case 'go':
      return ['sos', 'sodos_lost', 'head_to_head', 'sosos'];
    case 'chess':
      return ['sos', 'head_to_head', 'wins', 'sosos'];
    default:
      return DEFAULT_TIEBREAK_ORDER;
  }
}

function specsFromOrder(order: readonly string[]): TiebreakSpec[] {
  const labels: Record<string, string> = {
    sos: '對手分',
    opponent_score: '對手分',
    sodos: '勝對手分',
    sodos_lost: '所負對手分',
    head_to_head: '彼此對戰',
    wins: '勝局',
    second_wins: '後手勝局',
    second_games: '後手賽局',
    sosos: '強對手分',
    sosos_weighted: '加權強對手分',
    sodos_of_sodos: '對手勝對手分',
    sodos_of_sodos_weighted: '加權對手勝對手分',
    fouls_asc: '技術犯規',
  };
  return order.map((id) => {
    const realId = id === 'opponent_score' ? 'sos' : id;
    return {
      id: realId as TiebreakSpec['id'],
      label: labels[id] ?? id,
      tip: labels[id] ?? id,
      direction: realId === 'fouls_asc' ? 'asc' : 'desc',
    };
  });
}

function toStandingsRow(row: ScoresheetRow): StandingsRow {
  return {
    playerId: row.playerId,
    played: row.played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    points: row.points,
    tiebreaks: { ...row.tiebreaks },
    rank: row.rank,
  };
}

/**
 * 計算排名（委派 @otc/scoring）。
 * 維持既有簽章；若未給 tiebreakOrder 則依棋種預設。
 */
export function computeStandings(args: {
  participants: string[];
  matches: FinishedMatch[];
  rules: RulesPlugin;
  tiebreakOrder?: readonly string[];
  winPoint?: number;
}): StandingsRow[] {
  const order = args.tiebreakOrder ?? getTiebreakOrderForGame(args.rules.gameKey);
  const winPoint = args.winPoint ?? args.rules.defaultWinPoint ?? 1;
  const entries = entriesFromNormalizedMatches({
    matches: args.matches,
    rules: args.rules,
    winPoint,
  });

  // 確保舊測所需的 sos/sodos/h2h/wins 都有算到
  const needed = new Set<string>([...order, 'sos', 'sodos', 'head_to_head', 'wins']);
  const specs = specsFromOrder([...needed].filter((id) => id !== 'opponent_score'));
  // 依 order 排序 specs，其餘附加於後
  const orderedIds = [
    ...order.map((id) => (id === 'opponent_score' ? 'sos' : id)),
    ...specs.map((s) => s.id).filter((id) => !order.includes(id) && !(order.includes('opponent_score') && id === 'sos')),
  ];
  const uniqueIds = [...new Set(orderedIds)];
  const tiebreakSpec = specsFromOrder(uniqueIds);

  const result = computeScoresheet({
    participants: args.participants.map((playerId) => ({ playerId })),
    entries,
    tiebreakSpec,
    winPoint,
  });

  // 依 order 重新排序（scoring 已依完整 spec 排序；此處對齊舊 API 的 order）
  const rows = result.rows.map(toStandingsRow);
  const orderForSort = order.map((id) => (id === 'opponent_score' ? 'sos' : id));
  return rows.sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    for (const key of orderForSort) {
      const tx = x.tiebreaks?.[key] ?? (key === 'wins' ? x.wins : 0);
      const ty = y.tiebreaks?.[key] ?? (key === 'wins' ? y.wins : 0);
      if (ty !== tx) return ty - tx;
    }
    return 0;
  });
}

export function computePublicPoints(args: {
  matches: FinishedMatch[];
  rules: RulesPlugin;
  winPoint?: number;
}): Array<{ playerId: string; points: number }> {
  const wp = args.winPoint ?? args.rules.defaultWinPoint ?? 1;
  const points = new Map<string, number>();
  for (const m of args.matches) {
    const score = args.rules.scoreMatch({ result: m.result, winPoint: wp });
    points.set(m.playerAId, (points.get(m.playerAId) ?? 0) + score.A.points);
    points.set(m.playerBId, (points.get(m.playerBId) ?? 0) + score.B.points);
  }
  return [...points.entries()]
    .map(([playerId, pts]) => ({ playerId, points: pts }))
    .sort((a, b) => b.points - a.points);
}
