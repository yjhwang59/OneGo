import { describe, it, expect } from 'vitest';
import { computeStandings, getTiebreakOrderForGame } from './standings';
import type { RulesPlugin, NormalizedMatchResult } from '@otc/rules';

const mockRules: RulesPlugin = {
  gameKey: 'gomoku',
  rulesetVersion: 'v1',
  validateMatchResult: () => ({ ok: true }),
  normalizeMatchResult: () => ({ ok: false, error: { ok: false, code: '', message: '' } }),
  scoreMatch({ result }: { result: NormalizedMatchResult }) {
    if (result.kind === 'win') {
      return result.winner === 'A' ? { A: { points: 1 }, B: { points: 0 } } : { A: { points: 0 }, B: { points: 1 } };
    }
    if (result.kind === 'draw') return { A: { points: 0.5 }, B: { points: 0.5 } };
    return { A: { points: 0 }, B: { points: 0 } };
  },
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
    // a>b, b>e, c>a  =>  a=b=c=1, e=0. cohort {a,b,c} connected via a-b and a-c
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
    // a: beat b (+0.5), lost c (-0.5) => 0 ; b: lost a (-0.5) ; c: beat a (+0.5)
    expect(m.get('a')!.tiebreaks!.head_to_head).toBeCloseTo(0, 5);
    expect(m.get('b')!.tiebreaks!.head_to_head).toBeCloseTo(-0.5, 5);
    expect(m.get('c')!.tiebreaks!.head_to_head).toBeCloseTo(0.5, 5);
  });
});

describe('getTiebreakOrderForGame', () => {
  it('returns game-specific orders', () => {
    expect(getTiebreakOrderForGame('gomoku')).toEqual(['sos', 'sodos', 'head_to_head', 'wins']);
    expect(getTiebreakOrderForGame('go')).toEqual(['sos', 'head_to_head', 'wins']);
    expect(getTiebreakOrderForGame('xiangqi')).toEqual(['sos', 'head_to_head', 'wins']);
    expect(getTiebreakOrderForGame('chess')).toEqual(['wins', 'head_to_head', 'opponent_score']);
  });
});
