import type { PlayerAccum, ScoringEntry } from './types';

function keyPart(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return Number.isFinite(v) ? v.toFixed(4) : '0';
  const s = String(v).trim();
  return s === '' ? '0' : s;
}

/**
 * 彼此對戰成績（移植 Sched computeHeadToHeadTiebreak）：
 * - 以 groupCols（H2H 欄位之前的所有排序欄）分同分組
 * - 同分組需形成單一連通圖，否則整組歸 0
 * - 每局累加 `己方得分 − 勝分/2`
 */
export function computeHeadToHead(
  acc: Map<string, PlayerAccum>,
  entries: ScoringEntry[],
  winPoint: number,
  groupCols: string[]
): void {
  const cols = groupCols.length > 0 ? groupCols : ['points'];
  const groups = new Map<string, string[]>();
  for (const row of acc.values()) {
    const parts = cols.map((c) => {
      if (c === 'points' || c === 'total_score') return keyPart(row.points);
      return keyPart(row.tiebreaks[c] ?? 0);
    });
    const k = parts.join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(row.playerId);
  }

  const value = new Map<string, number>([...acc.keys()].map((id) => [id, 0]));
  const groupKeyByPlayer = new Map<string, string>();
  for (const [k, ids] of groups) {
    if (ids.length <= 1) continue;
    for (const id of ids) groupKeyByPlayer.set(id, k);
  }

  // 建「同組對局」清單（以 round+雙方為鍵，避免重複）
  const pairingsByGroup = new Map<string, Array<{ a: string; b: string; scoreA: number; scoreB: number }>>();
  const seen = new Set<string>();
  for (const e of entries) {
    if (!e.opponentId || e.score == null) continue;
    const gA = groupKeyByPlayer.get(e.playerId);
    const gB = groupKeyByPlayer.get(e.opponentId);
    if (gA == null || gA !== gB) continue;
    const a = e.playerId < e.opponentId ? e.playerId : e.opponentId;
    const b = e.playerId < e.opponentId ? e.opponentId : e.playerId;
    const pairKey = `${gA}|${e.roundNo}|${a}|${b}`;
    if (seen.has(pairKey)) continue;
    // 找對手該輪得分
    const opp = entries.find(
      (x) => x.playerId === e.opponentId && x.roundNo === e.roundNo && x.opponentId === e.playerId
    );
    if (!opp || opp.score == null) continue;
    seen.add(pairKey);
    if (!pairingsByGroup.has(gA)) pairingsByGroup.set(gA, []);
    pairingsByGroup.get(gA)!.push({
      a: e.playerId,
      b: e.opponentId,
      scoreA: e.score,
      scoreB: opp.score,
    });
  }

  const half = winPoint / 2;
  for (const [k, ids] of groups) {
    if (ids.length <= 1) continue;
    const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
    const groupValue = new Map<string, number>(ids.map((id) => [id, 0]));

    for (const row of pairingsByGroup.get(k) ?? []) {
      adj.get(row.a)!.push(row.b);
      adj.get(row.b)!.push(row.a);
      groupValue.set(row.a, (groupValue.get(row.a) ?? 0) + (row.scoreA - half));
      groupValue.set(row.b, (groupValue.get(row.b) ?? 0) + (row.scoreB - half));
    }

    const start = ids[0]!;
    const visited = new Set<string>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const u = queue.shift()!;
      for (const v of adj.get(u) ?? []) {
        if (!visited.has(v)) {
          visited.add(v);
          queue.push(v);
        }
      }
    }
    if (visited.size !== ids.length) continue;
    for (const id of ids) value.set(id, groupValue.get(id) ?? 0);
  }

  for (const [pid, v] of value) {
    const row = acc.get(pid);
    if (row) row.tiebreaks.head_to_head = v;
  }
}

/** H2H 欄位之前的排序鍵（points + 前序輔分 id） */
export function headToHeadGroupCols(specIds: string[], h2hIndex: number): string[] {
  if (h2hIndex <= 0) return ['points'];
  return ['points', ...specIds.slice(0, h2hIndex)];
}
