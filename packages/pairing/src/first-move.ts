import type { FirstMove } from './types';

/**
 * 決定瑞士制單場先手（移植自 Sched decideFirstMove 的精神）：
 * 先手次數較少者取得先手；相同則預設由 A（playerA）先手。
 * 用於象棋/圍棋/五子等有先手概念的棋種，讓先後手在賽事中盡量平衡。
 *
 * @param counts 各選手至今被指派為先手的次數
 */
export function decideFirstMove(aId: string, bId: string, counts: Map<string, number>): FirstMove {
  const a = counts.get(aId) ?? 0;
  const b = counts.get(bId) ?? 0;
  if (a < b) return 'A';
  if (b < a) return 'B';
  return 'A';
}
