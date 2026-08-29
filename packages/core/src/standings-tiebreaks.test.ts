import { describe, it, expect } from 'vitest';
import { computeStandings, getTiebreakOrderForGame } from './standings';
import type { RulesPlugin, NormalizedMatchResult } from '@otc/rules';

const mockRules: RulesPlugin = {
  gameKey: 'gomoku',
  rulesetVersion: 'v1',
  defaultWinPoint: 1,
  validateMatchResult: () => ({ ok: true }),
  normalizeMatchResult: () => ({ ok: false, error: { ok: false, code: '', message: '' } }),
  scoreMatch({ result }: { result: NormalizedMatchResult }) {
    if (result.kind === 'win') {
      return result.winner === 'A' ? { A: { points: 1 }, B: { points: 0 } } : { A: { points: 0 }, B: { points: 1 } };
    }
    if (result.kind === 'draw') return { A: { points: 0.5 }, B: { points: 0.5 } };
    return { A: { points: 0 }, B: { points: 0 } };
  },
  tiebreakSpec: () => [
    { id: 'sos', label: '輔一', tip: '' },
    { id: 'sodos', label: '輔二', tip: '' },
    { id: 'head_to_head', label: '輔三', tip: '' },
    { id: 'sosos', label: '輔四', tip: '' },
  ],
};

const byId = (rows: ReturnType<typeof computeStandings>) => new Map(rows.map((r) => [r.playerId, r]));

describe('tiebreaks: SOS / SODOS', () => {
  it('sos equals sum of opponents final points and mirrors opponent_score', () => {
    // a beats b and c; b beats c. Final: a=2, b=1, c=0
    const rows = computeStandings({
      participants: ['a', 'b', 'c'],
      matches: [
        { playerAId: 'a', playerBId: 'b', result: { kind: 'win', winner: 'A' } },
        { playerAId: 'a', playerBId: 'c', result: { kind: 'win', winner: 'A' } },
        { playerAId: 'b', playerBId: 'c', result: { kind: 'win', winner: 'A' } },
      ],
      rules: mockRules,
    });
    const m = byId(rows);
    // a's opponents b(1)+c(0) = 1
    expect(m.get('a')!.tiebreaks!.sos).toBe(1);
    expect(m.get('a')!.tiebreaks!.sos).toBe(m.get('a')!.tiebreaks!.opponent_score);
    // b's opponents a(2)+c(0) = 2
    expect(m.get('b')!.tiebreaks!.sos).toBe(2);
  });

  it('sodos weights won opponents fully and drawn opponents by half', () => {
    // a beats b, a draws c; b beats d; c beats d. Final: a=1.5, b=1, c=1, d=0
    const rows = computeStandings({
      participants: ['a', 'b', 'c', 'd'],
      matches: [
        { playerAId: 'a', playerBId: 'b', result: { kind: 'win', winner: 'A' } },
        { playerAId: 'a', playerBId: 'c', result: { kind: 'draw' } },
        { playerAId: 'b', playerBId: 'd', result: { kind: 'win', winner: 'A' } },
        { playerAId: 'c', playerBId: 'd', result: { kind: 'win', winner: 'A' } },
      ],
      rules: mockRules,
    });
    const m = byId(rows);
    // Final points: a=1.5, b=1, c=1.5 (beat d + drew a), d=0
    // sodos_a = 1*(b=1) + 0.5*(c=1.5) = 1.75
    expect(m.get('a')!.tiebreaks!.sodos).toBeCloseTo(1.75, 5);
  });
});

describe('tiebreaks: head-to-head connectivity gate', () => {
  it('zeroes head_to_head when an equal-points cohort is not a single connected component', () => {
    // a>b, b>e, c>d, d>f  =>  a=b=c=d=1, e=f=0
    // cohort points=1 is {a,b,c,d}; intra games a-b and c-d form two components => all 0
    const rows = computeStandings({
      participants: ['a', 'b', 'c', 'd', 'e', 'f'],
      matches: [
        { playerAId: 'a', playerBId: 'b', result: { kind: 'win', winner: 'A' } },
        { playerAId: 'b', playerBId: 'e', result: { kind: 'win', winner: 'A' } },
        { playerAId: 'c', playerBId: 'd', result: { kind: 'win', winner: 'A' } },
        { playerAId: 'd', playerBId: 'f', result: { kind: 'win', winner: 'A' } },
      ],
      rules: mockRules,
    });
    const m = byId(rows);
    for (const id of ['a', 'b', 'c', 'd']) expect(m.get(id)!.tiebreaks!.head_to_head).toBe(0);
  });

  it('computes head_to_head within a connected equal-points cohort (zero-sum)', () => {
    // 僅以 points 分組時：a>b, b>e, c>a  =>  a=b=c=1，cohort {a,b,c} 連通
    // 使用只含 head_to_head 的 order，避免前序 sos/sodos 拆開同分組（Sched 行為）
    const rows = computeStandings({
      participants: ['a', 'b', 'c', 'e'],
      matches: [
        { playerAId: 'a', playerBId: 'b', result: { kind: 'win', winner: 'A' } },
        { playerAId: 'b', playerBId: 'e', result: { kind: 'win', winner: 'A' } },
        { playerAId: 'c', playerBId: 'a', result: { kind: 'win', winner: 'A' } },
      ],
      rules: mockRules,
      tiebreakOrder: ['head_to_head'],
    });
    const m = byId(rows);
    // a: beat b (+0.5), lost c (-0.5) => 0 ; b: lost a (-0.5) ; c: beat a (+0.5)
    expect(m.get('a')!.tiebreaks!.head_to_head).toBeCloseTo(0, 5);
    expect(m.get('b')!.tiebreaks!.head_to_head).toBeCloseTo(-0.5, 5);
    expect(m.get('c')!.tiebreaks!.head_to_head).toBeCloseTo(0.5, 5);
  });

  it('does not apply head_to_head across players split by prior tiebreaks (Sched)', () => {
    // 預設 gomoku order 下 H2H 前有 sos/sodos；同分但 sos 不同者不進同一 H2H 組
    const rows = computeStandings({
      participants: ['a', 'b', 'c', 'e'],
      matches: [
        { playerAId: 'a', playerBId: 'b', result: { kind: 'win', winner: 'A' } },
        { playerAId: 'b', playerBId: 'e', result: { kind: 'win', winner: 'A' } },
        { playerAId: 'c', playerBId: 'a', result: { kind: 'win', winner: 'A' } },
      ],
      rules: mockRules,
    });
    const m = byId(rows);
    // a.sos=2, b.sos=1, c.sos=1 → a 單獨一組；b/c 無對戰且不連通 → H2H 皆 0
    expect(m.get('a')!.tiebreaks!.head_to_head).toBe(0);
    expect(m.get('b')!.tiebreaks!.head_to_head).toBe(0);
    expect(m.get('c')!.tiebreaks!.head_to_head).toBe(0);
  });
});

describe('getTiebreakOrderForGame', () => {
  it('returns game-specific orders aligned with RulesPlugin', () => {
    expect(getTiebreakOrderForGame('gomoku')).toEqual([
      'sos',
      'sodos',
      'head_to_head',
      'sosos',
      'sodos_of_sodos',
      'sosos_weighted',
      'sodos_of_sodos_weighted',
    ]);
    expect(getTiebreakOrderForGame('go')).toEqual(['sos', 'sodos_lost', 'head_to_head', 'sosos']);
    expect(getTiebreakOrderForGame('xiangqi')).toEqual([
      'sos',
      'head_to_head',
      'wins',
      'second_wins',
      'second_games',
      'sosos',
      'fouls_asc',
    ]);
    expect(getTiebreakOrderForGame('chess')).toEqual(['sos', 'head_to_head', 'wins', 'sosos']);
  });
});
