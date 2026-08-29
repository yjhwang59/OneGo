import type { TiebreakId, TiebreakSpec } from '@otc/rules';
import type { PlayerAccum, ScoringEntry } from './types';

function emptyMap(ids: string[]): Map<string, number> {
  return new Map(ids.map((id) => [id, 0]));
}

function assign(acc: Map<string, PlayerAccum>, id: TiebreakId, values: Map<string, number>): void {
  for (const [pid, v] of values) {
    const row = acc.get(pid);
    if (row) row.tiebreaks[id] = v;
  }
}

/** 對手分：每輪對手總分；可取最高 N 輪 */
export function computeSos(
  acc: Map<string, PlayerAccum>,
  entries: ScoringEntry[],
  pointsMap: Map<string, number>,
  cutKeepTop?: number
): void {
  const perRound = new Map<string, number[]>();
  for (const e of entries) {
    if (!e.opponentId) continue;
    if (!perRound.has(e.playerId)) perRound.set(e.playerId, []);
    perRound.get(e.playerId)!.push(pointsMap.get(e.opponentId) ?? 0);
  }
  const out = emptyMap([...acc.keys()]);
  for (const [pid, rounds] of perRound) {
    let vals = rounds;
    if (cutKeepTop != null && cutKeepTop > 0 && vals.length > cutKeepTop) {
      vals = [...vals].sort((a, b) => b - a).slice(0, cutKeepTop);
    }
    out.set(
      pid,
      vals.reduce((s, v) => s + v, 0)
    );
  }
  assign(acc, 'sos', out);
  // 相容舊鍵名
  for (const [pid, v] of out) {
    const row = acc.get(pid);
    if (row) row.tiebreaks.opponent_score = v;
  }
}

/** SODOS：sum((score/winPoint) * oppTotal) */
export function computeSodos(
  acc: Map<string, PlayerAccum>,
  entries: ScoringEntry[],
  pointsMap: Map<string, number>,
  winPoint: number
): void {
  const out = emptyMap([...acc.keys()]);
  if (winPoint <= 0) {
    assign(acc, 'sodos', out);
    return;
  }
  for (const e of entries) {
    if (!e.opponentId || e.score == null) continue;
    out.set(e.playerId, (out.get(e.playerId) ?? 0) + (e.score / winPoint) * (pointsMap.get(e.opponentId) ?? 0));
  }
  assign(acc, 'sodos', out);
}

/**
 * 所負對手總分和（Sched 圍棋輔二現行行為）：
 * 當對手得分 ≥ 勝分（即自己輸）時，累加對手總分。
 */
export function computeSodosLost(
  acc: Map<string, PlayerAccum>,
  entries: ScoringEntry[],
  pointsMap: Map<string, number>,
  winPoint: number
): void {
  const out = emptyMap([...acc.keys()]);
  const byRoundOpp = new Map<string, ScoringEntry>();
  for (const e of entries) {
    if (!e.opponentId) continue;
    byRoundOpp.set(`${e.playerId}|${e.roundNo}|${e.opponentId}`, e);
  }
  for (const e of entries) {
    if (!e.opponentId) continue;
    const oppEntry = byRoundOpp.get(`${e.opponentId}|${e.roundNo}|${e.playerId}`);
    if (!oppEntry || oppEntry.score == null) continue;
    if (oppEntry.score >= winPoint - 0.01) {
      out.set(e.playerId, (out.get(e.playerId) ?? 0) + (pointsMap.get(e.opponentId) ?? 0));
    }
  }
  assign(acc, 'sodos_lost', out);
}

export function computeWinsTiebreak(acc: Map<string, PlayerAccum>): void {
  for (const row of acc.values()) {
    row.tiebreaks.wins = row.wins;
  }
}

export function computeSecondStats(
  acc: Map<string, PlayerAccum>,
  entries: ScoringEntry[],
  winPoint: number
): void {
  const secondWins = emptyMap([...acc.keys()]);
  const secondGames = emptyMap([...acc.keys()]);
  for (const e of entries) {
    if (!e.opponentId || e.isFirstMove == null) continue;
    if (e.isFirstMove) continue;
    secondGames.set(e.playerId, (secondGames.get(e.playerId) ?? 0) + 1);
    if (e.score != null && e.score >= winPoint) {
      secondWins.set(e.playerId, (secondWins.get(e.playerId) ?? 0) + 1);
    }
  }
  assign(acc, 'second_wins', secondWins);
  assign(acc, 'second_games', secondGames);
}

/** 對手 sos 之和 */
export function computeSosos(
  acc: Map<string, PlayerAccum>,
  entries: ScoringEntry[]
): void {
  const out = emptyMap([...acc.keys()]);
  for (const e of entries) {
    if (!e.opponentId) continue;
    const oppSos = acc.get(e.opponentId)?.tiebreaks.sos ?? 0;
    out.set(e.playerId, (out.get(e.playerId) ?? 0) + oppSos);
  }
  assign(acc, 'sosos', out);
}

export function computeSososWeighted(
  acc: Map<string, PlayerAccum>,
  entries: ScoringEntry[],
  winPoint: number
): void {
  const out = emptyMap([...acc.keys()]);
  if (winPoint <= 0) {
    assign(acc, 'sosos_weighted', out);
    return;
  }
  for (const e of entries) {
    if (!e.opponentId || e.score == null) continue;
    const oppSos = acc.get(e.opponentId)?.tiebreaks.sos ?? 0;
    out.set(e.playerId, (out.get(e.playerId) ?? 0) + (e.score / winPoint) * oppSos);
  }
  assign(acc, 'sosos_weighted', out);
}

export function computeSodosOfSodos(
  acc: Map<string, PlayerAccum>,
  entries: ScoringEntry[]
): void {
  const out = emptyMap([...acc.keys()]);
  for (const e of entries) {
    if (!e.opponentId) continue;
    const opp = acc.get(e.opponentId)?.tiebreaks.sodos ?? 0;
    out.set(e.playerId, (out.get(e.playerId) ?? 0) + opp);
  }
  assign(acc, 'sodos_of_sodos', out);
}

export function computeSodosOfSodosWeighted(
  acc: Map<string, PlayerAccum>,
  entries: ScoringEntry[],
  winPoint: number
): void {
  const out = emptyMap([...acc.keys()]);
  if (winPoint <= 0) {
    assign(acc, 'sodos_of_sodos_weighted', out);
    return;
  }
  for (const e of entries) {
    if (!e.opponentId || e.score == null) continue;
    const opp = acc.get(e.opponentId)?.tiebreaks.sodos ?? 0;
    out.set(e.playerId, (out.get(e.playerId) ?? 0) + (e.score / winPoint) * opp);
  }
  assign(acc, 'sodos_of_sodos_weighted', out);
}

export function computeFoulsAsc(
  acc: Map<string, PlayerAccum>,
  foulCounts: Record<string, number>
): void {
  for (const row of acc.values()) {
    row.tiebreaks.fouls_asc = foulCounts[row.playerId] ?? 0;
  }
}

/** 依 tiebreakSpec 順序套用已實作的輔分 */
export function applyTiebreak(
  id: TiebreakId,
  acc: Map<string, PlayerAccum>,
  ctx: {
    entries: ScoringEntry[];
    pointsMap: Map<string, number>;
    winPoint: number;
    foulCounts: Record<string, number>;
    cutKeepTop?: number;
  }
): void {
  switch (id) {
    case 'sos':
      computeSos(acc, ctx.entries, ctx.pointsMap, ctx.cutKeepTop);
      break;
    case 'sodos':
      computeSodos(acc, ctx.entries, ctx.pointsMap, ctx.winPoint);
      break;
    case 'sodos_lost':
      computeSodosLost(acc, ctx.entries, ctx.pointsMap, ctx.winPoint);
      break;
    case 'wins':
      computeWinsTiebreak(acc);
      break;
    case 'second_wins':
    case 'second_games':
      computeSecondStats(acc, ctx.entries, ctx.winPoint);
      break;
    case 'sosos':
      computeSosos(acc, ctx.entries);
      break;
    case 'sosos_weighted':
      computeSososWeighted(acc, ctx.entries, ctx.winPoint);
      break;
    case 'sodos_of_sodos':
      computeSodosOfSodos(acc, ctx.entries);
      break;
    case 'sodos_of_sodos_weighted':
      computeSodosOfSodosWeighted(acc, ctx.entries, ctx.winPoint);
      break;
    case 'fouls_asc':
      computeFoulsAsc(acc, ctx.foulCounts);
      break;
    case 'head_to_head':
      // 由呼叫端在知道前序欄位後單獨套用
      break;
    default:
      break;
  }
}

export function getSosCutFromSpec(specs: TiebreakSpec[]): number | undefined {
  const sos = specs.find((s) => s.id === 'sos');
  return sos?.cut?.keepTop;
}
