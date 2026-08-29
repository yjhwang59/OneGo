import { describe, it, expect } from 'vitest';
import {
  computeScoresheet,
  computeScoresheetWithRules,
  getUsedTiebreakCount,
  type ScoringEntry,
} from './index';
import { goRulesV1, gomokuRulesV1, xiangqiRulesV1 } from '@otc/rules';

function entry(
  playerId: string,
  roundNo: number,
  opponentId: string | undefined,
  score: number,
  opts?: { first?: boolean; kind?: ScoringEntry['kind'] }
): ScoringEntry {
  return {
    playerId,
    roundNo,
    opponentId,
    kind: opts?.kind ?? (opponentId ? 'normal' : 'bye'),
    score,
    isFirstMove: opts?.first,
  };
}

describe('computeScoresheet basic', () => {
  it('sums points and assigns ranks', () => {
    const result = computeScoresheetWithRules({
      participants: [{ playerId: 'a' }, { playerId: 'b' }, { playerId: 'c' }],
      entries: [
        entry('a', 1, 'b', 1, { first: true }),
        entry('b', 1, 'a', 0, { first: false }),
        entry('a', 2, 'c', 1, { first: false }),
        entry('c', 2, 'a', 0, { first: true }),
        entry('b', 2, 'c', 0, { first: true }),
        entry('c', 2, 'b', 1, { first: false }),
      ],
      rules: goRulesV1,
      winPoint: 1,
    });
    expect(result.rows[0]!.playerId).toBe('a');
    expect(result.rows[0]!.points).toBe(2);
    expect(result.rows[0]!.rank).toBe(1);
  });

  it('applies bye points without counting W/D/L', () => {
    const result = computeScoresheet({
      participants: [{ playerId: 'a' }, { playerId: 'b' }],
      entries: [
        entry('a', 1, undefined, 2, { kind: 'bye' }),
        entry('b', 1, undefined, 0, { kind: 'absent' }),
      ],
      tiebreakSpec: goRulesV1.tiebreakSpec(),
      winPoint: 2,
    });
    const a = result.rows.find((r) => r.playerId === 'a')!;
    expect(a.points).toBe(2);
    expect(a.played).toBe(0);
    expect(a.wins).toBe(0);
  });

  it('applies score adjustments and foul ascending tiebreak', () => {
    const result = computeScoresheetWithRules({
      participants: [{ playerId: 'a' }, { playerId: 'b' }],
      entries: [
        entry('a', 1, 'b', 2, { first: true }),
        entry('b', 1, 'a', 0, { first: false }),
      ],
      rules: xiangqiRulesV1,
      winPoint: 2,
      adjustments: { a: -0.5 },
      foulCounts: { a: 2, b: 0 },
    });
    const a = result.rows.find((r) => r.playerId === 'a')!;
    const b = result.rows.find((r) => r.playerId === 'b')!;
    expect(a.points).toBe(1.5);
    expect(a.tiebreaks.fouls_asc).toBe(2);
    expect(b.tiebreaks.fouls_asc).toBe(0);
  });

  it('cuts SOS to keepTop highest opponent scores', () => {
    // a 對上 b(5), c(4), d(1), e(0) → 全取 10；keepTop=2 → 5+4=9
    const pointsViaResults: ScoringEntry[] = [];
    // 先用人工 entries：只需要 a 的對手列；sos 讀的是最終 pointsMap
    // 透過真實對局構造最終積分：b=5,c=4 用多場難以手動，直接測 computeSos 路徑：
    // 用假 entries + 調整分把對手總分墊高
    const participants = ['a', 'b', 'c', 'd', 'e'].map((playerId) => ({ playerId }));
    const adjustments = { b: 5, c: 4, d: 1, e: 0, a: 0 };
    const entries: ScoringEntry[] = [
      entry('a', 1, 'b', 0),
      entry('b', 1, 'a', 0),
      entry('a', 2, 'c', 0),
      entry('c', 2, 'a', 0),
      entry('a', 3, 'd', 0),
      entry('d', 3, 'a', 0),
      entry('a', 4, 'e', 0),
      entry('e', 4, 'a', 0),
    ];
    const full = computeScoresheet({
      participants,
      entries,
      tiebreakSpec: [{ id: 'sos', label: '輔一', tip: '' }],
      winPoint: 1,
      adjustments,
    });
    expect(full.rows.find((r) => r.playerId === 'a')!.tiebreaks.sos).toBe(10);

    const cut = computeScoresheet({
      participants,
      entries,
      tiebreakSpec: [{ id: 'sos', label: '輔一', tip: '', cut: { keepTop: 2 } }],
      winPoint: 1,
      adjustments,
    });
    expect(cut.rows.find((r) => r.playerId === 'a')!.tiebreaks.sos).toBe(9);
  });
});

describe('xiangqi second-hand stats', () => {
  it('counts second_wins and second_games', () => {
    const result = computeScoresheetWithRules({
      participants: [{ playerId: 'a' }, { playerId: 'b' }],
      entries: [
        entry('a', 1, 'b', 2, { first: false }),
        entry('b', 1, 'a', 0, { first: true }),
      ],
      rules: xiangqiRulesV1,
      winPoint: 2,
    });
    const a = result.rows.find((r) => r.playerId === 'a')!;
    expect(a.tiebreaks.second_games).toBe(1);
    expect(a.tiebreaks.second_wins).toBe(1);
    expect(a.tiebreaks.wins).toBe(1);
  });
});

describe('getUsedTiebreakCount', () => {
  it('returns 0 when all points differ', () => {
    const result = computeScoresheetWithRules({
      participants: [{ playerId: 'a' }, { playerId: 'b' }],
      entries: [
        entry('a', 1, 'b', 1, { first: true }),
        entry('b', 1, 'a', 0, { first: false }),
      ],
      rules: gomokuRulesV1,
    });
    expect(getUsedTiebreakCount(result.rows, result.tiebreakSpec)).toBe(0);
  });
});
