import type { NormalizedMatchResult, RulesPlugin, TiebreakSpec } from '@otc/rules';
import { computeHeadToHead, headToHeadGroupCols } from './head-to-head';
import { assignRank, getUsedTiebreakCount } from './rank';
import { applyTiebreak, getSosCutFromSpec } from './tiebreaks';
import type {
  ComputeScoresheetArgs,
  ComputeScoresheetResult,
  PlayerAccum,
  ScoringEntry,
  ScoringParticipant,
} from './types';

function initAccum(participants: ScoringParticipant[]): Map<string, PlayerAccum> {
  const map = new Map<string, PlayerAccum>();
  for (const p of participants) {
    map.set(p.playerId, {
      playerId: p.playerId,
      seedNo: p.seedNo,
      withdrawn: !!p.withdrawn,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      tiebreaks: {},
    });
  }
  return map;
}

function applyEntries(
  acc: Map<string, PlayerAccum>,
  entries: ScoringEntry[],
  winPoint: number
): void {
  for (const e of entries) {
    const row = acc.get(e.playerId);
    if (!row || e.score == null) continue;
    row.points += e.score;
    if (e.kind === 'bye' || e.kind === 'absent') {
      // 輪空／缺席：計分但不計 W/D/L（與 Sched 輪空給分一致）
      continue;
    }
    row.played += 1;
    if (e.score >= winPoint - 1e-9) row.wins += 1;
    else if (e.score <= 1e-9) row.losses += 1;
    else row.draws += 1;
  }
}

/**
 * 成績計算主入口：總分 → 依 tiebreakSpec 逐項輔分 → 名次 → usedTiebreakCount
 */
export function computeScoresheet(args: ComputeScoresheetArgs): ComputeScoresheetResult {
  const winPoint = args.winPoint > 0 ? args.winPoint : 1;
  const specs = args.tiebreakSpec;
  const acc = initAccum(args.participants);
  applyEntries(acc, args.entries, winPoint);

  // 總成績加減分
  for (const [pid, delta] of Object.entries(args.adjustments ?? {})) {
    const row = acc.get(pid);
    if (row) row.points += delta;
  }

  const pointsMap = new Map([...acc.values()].map((r) => [r.playerId, r.points]));
  const foulCounts = args.foulCounts ?? {};
  const cutKeepTop = getSosCutFromSpec(specs);
  const specIds = specs.map((s) => s.id);

  // 依規格順序套用；head_to_head 需前序欄位已算完
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    if (spec.id === 'head_to_head') {
      computeHeadToHead(acc, args.entries, winPoint, headToHeadGroupCols(specIds, i));
      continue;
    }
    applyTiebreak(spec.id, acc, {
      entries: args.entries,
      pointsMap,
      winPoint,
      foulCounts,
      cutKeepTop: spec.id === 'sos' ? cutKeepTop : undefined,
    });
  }

  const rows = assignRank([...acc.values()], specs);
  const usedTiebreakCount = getUsedTiebreakCount(rows, specs);
  return { rows, tiebreakSpec: specs, usedTiebreakCount };
}

/** 將正規化對局轉成雙方 ScoringEntry（供 standings 橋接） */
export function entriesFromNormalizedMatches(args: {
  matches: Array<{
    playerAId: string;
    playerBId: string;
    result: NormalizedMatchResult;
    firstMove?: 'A' | 'B';
    roundNo?: number;
  }>;
  rules: RulesPlugin;
  winPoint?: number;
}): ScoringEntry[] {
  const wp = args.winPoint ?? args.rules.defaultWinPoint;
  const out: ScoringEntry[] = [];
  let autoRound = 0;
  for (const m of args.matches) {
    const roundNo = m.roundNo ?? ++autoRound;
    const score = args.rules.scoreMatch({ result: m.result, winPoint: wp });
    out.push({
      playerId: m.playerAId,
      roundNo,
      opponentId: m.playerBId,
      kind: 'normal',
      score: score.A.points,
      isFirstMove: m.firstMove === 'A' ? true : m.firstMove === 'B' ? false : undefined,
    });
    out.push({
      playerId: m.playerBId,
      roundNo,
      opponentId: m.playerAId,
      kind: 'normal',
      score: score.B.points,
      isFirstMove: m.firstMove === 'B' ? true : m.firstMove === 'A' ? false : undefined,
    });
  }
  return out;
}

/** 便捷：從 RulesPlugin 取 spec 並計算 */
export function computeScoresheetWithRules(args: {
  participants: ScoringParticipant[];
  entries: ScoringEntry[];
  rules: RulesPlugin;
  winPoint?: number;
  sosKeepTop?: number | null;
  roundCount?: number;
  adjustments?: Record<string, number>;
  foulCounts?: Record<string, number>;
}): ComputeScoresheetResult {
  const winPoint = args.winPoint ?? args.rules.defaultWinPoint;
  const tiebreakSpec: TiebreakSpec[] = args.rules.tiebreakSpec({
    roundCount: args.roundCount,
    sosKeepTop: args.sosKeepTop,
  });
  return computeScoresheet({
    participants: args.participants,
    entries: args.entries,
    tiebreakSpec,
    winPoint,
    adjustments: args.adjustments,
    foulCounts: args.foulCounts,
  });
}

export type {
  ComputeScoresheetArgs,
  ComputeScoresheetResult,
  ScoringEntry,
  ScoringParticipant,
  ScoresheetRow,
} from './types';
export { assignRank, getUsedTiebreakCount } from './rank';
export { computeHeadToHead } from './head-to-head';
