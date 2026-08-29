import type { TiebreakSpec } from '@otc/rules';
import type { PlayerAccum, ScoresheetRow } from './types';

function tbValue(row: PlayerAccum, id: string): number {
  if (id === 'points' || id === 'total_score') return row.points;
  return row.tiebreaks[id] ?? 0;
}

function compareRows(a: PlayerAccum, b: PlayerAccum, specs: TiebreakSpec[]): number {
  if (a.withdrawn !== b.withdrawn) return a.withdrawn ? 1 : -1;
  if (b.points !== a.points) return b.points - a.points;
  for (const spec of specs) {
    const va = tbValue(a, spec.id);
    const vb = tbValue(b, spec.id);
    if (va === vb) continue;
    if (spec.direction === 'asc') return va - vb;
    return vb - va;
  }
  return (a.seedNo ?? 0) - (b.seedNo ?? 0);
}

function rankKey(row: PlayerAccum, specs: TiebreakSpec[]): string {
  const parts = [`w:${row.withdrawn ? 1 : 0}`, `p:${row.points.toFixed(4)}`];
  for (const spec of specs) parts.push(`${spec.id}:${tbValue(row, spec.id).toFixed(4)}`);
  return parts.join('|');
}

/** 同分同名次（competition rank：並列後跳號） */
export function assignRank(rows: PlayerAccum[], specs: TiebreakSpec[]): ScoresheetRow[] {
  const sorted = [...rows].sort((a, b) => compareRows(a, b, specs));
  let rank = 0;
  let prevKey: string | null = null;
  const rankById = new Map<string, number>();
  sorted.forEach((p, i) => {
    const key = rankKey(p, specs);
    if (prevKey !== key) {
      rank = i + 1;
      prevKey = key;
    }
    rankById.set(p.playerId, rank);
  });
  return sorted.map((p) => ({
    playerId: p.playerId,
    seedNo: p.seedNo,
    withdrawn: p.withdrawn,
    played: p.played,
    wins: p.wins,
    draws: p.draws,
    losses: p.losses,
    points: p.points,
    rank: rankById.get(p.playerId) ?? 0,
    tiebreaks: { ...p.tiebreaks },
  }));
}

/**
 * 實際用到的輔分欄位數（移植 Sched getUsedTiebreakCount）：
 * 從總分同分組開始，逐欄看是否能拆開；回傳最深用到的欄位數。
 */
export function getUsedTiebreakCount(rows: ScoresheetRow[], specs: TiebreakSpec[]): number {
  if (rows.length < 2 || specs.length === 0) return 0;

  const initial = new Map<string, ScoresheetRow[]>();
  for (const r of rows) {
    const k = `${r.withdrawn ? 1 : 0}|${r.points.toFixed(4)}`;
    if (!initial.has(k)) initial.set(k, []);
    initial.get(k)!.push(r);
  }
  let tiedGroups = [...initial.values()].filter((g) => g.length > 1);
  let deepest = 0;

  for (let i = 0; i < specs.length && tiedGroups.length > 0; i++) {
    const id = specs[i]!.id;
    const next: ScoresheetRow[][] = [];
    let differentiates = false;
    for (const group of tiedGroups) {
      const buckets = new Map<string, ScoresheetRow[]>();
      for (const p of group) {
        const vk = (p.tiebreaks[id] ?? 0).toFixed(4);
        if (!buckets.has(vk)) buckets.set(vk, []);
        buckets.get(vk)!.push(p);
      }
      if (buckets.size > 1) differentiates = true;
      for (const bucket of buckets.values()) {
        if (bucket.length > 1) next.push(bucket);
      }
    }
    if (differentiates) deepest = i + 1;
    tiedGroups = next;
  }
  return deepest;
}
