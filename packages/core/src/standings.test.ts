import { describe, it, expect } from 'vitest';
import { computeStandings, computePublicPoints } from './standings';
import type { RulesPlugin } from '@otc/rules';
import type { NormalizedMatchResult } from '@otc/rules';

const mockRules: RulesPlugin = {
  gameKey: 'go',
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

describe('computeStandings', () => {
  it('initialises all participants with zero stats', () => {
    const rows = computeStandings({ participants: ['a', 'b'], matches: [], rules: mockRules });
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerId: 'a', played: 0, wins: 0, draws: 0, losses: 0, points: 0 }),
        expect.objectContaining({ playerId: 'b', played: 0, wins: 0, draws: 0, losses: 0, points: 0 }),
      ])
    );
  });

  it('updates points and W/D/L from matches', () => {
    const rows = computeStandings({
      participants: ['a', 'b'],
      matches: [
        { playerAId: 'a', playerBId: 'b', result: { kind: 'win', winner: 'A' } },
      ],
      rules: mockRules,
    });
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.playerId === 'a')!;
    const b = rows.find((r) => r.playerId === 'b')!;
    expect(a.played).toBe(1);
    expect(a.wins).toBe(1);
    expect(a.points).toBe(1);
    expect(b.played).toBe(1);
    expect(b.losses).toBe(1);
    expect(b.points).toBe(0);
  });

  it('sorts by points descending', () => {
    const rows = computeStandings({
      participants: ['a', 'b', 'c'],
      matches: [
        { playerAId: 'a', playerBId: 'b', result: { kind: 'win', winner: 'A' } },
        { playerAId: 'a', playerBId: 'c', result: { kind: 'win', winner: 'A' } },
        { playerAId: 'b', playerBId: 'c', result: { kind: 'win', winner: 'B' } },
      ],
      rules: mockRules,
    });
    expect(rows[0].playerId).toBe('a');
    expect(rows[0].points).toBe(2);
    expect(rows[1].playerId).toBe('c');
    expect(rows[1].points).toBe(1);
    expect(rows[2].playerId).toBe('b');
    expect(rows[2].points).toBe(0);
  });

  it('includes tiebreaks for all rows', () => {
    const rows = computeStandings({
      participants: ['a', 'b', 'c'],
      matches: [
        { playerAId: 'a', playerBId: 'b', result: { kind: 'win', winner: 'A' } },
        { playerAId: 'a', playerBId: 'c', result: { kind: 'win', winner: 'B' } },
        { playerAId: 'b', playerBId: 'c', result: { kind: 'win', winner: 'B' } },
      ],
      rules: mockRules,
    });
    expect(rows).toHaveLength(3);
    const pointsSum = rows.reduce((s, r) => s + r.points, 0);
    expect(pointsSum).toBe(3);
    for (const row of rows) {
      expect(row.tiebreaks).toBeDefined();
      expect(row.tiebreaks?.wins).toBeDefined();
      expect(row.tiebreaks?.opponent_score).toBeDefined();
      expect(row.tiebreaks?.head_to_head).toBeDefined();
    }
  });
});

describe('computePublicPoints', () => {
  it('aggregates points from matches only', () => {
    const result = computePublicPoints({
      matches: [
        { playerAId: 'a', playerBId: 'b', result: { kind: 'win', winner: 'A' } },
        { playerAId: 'a', playerBId: 'c', result: { kind: 'draw' } },
      ],
      rules: mockRules,
    });
    expect(result).toEqual(
      expect.arrayContaining([
        { playerId: 'a', points: 1.5 },
        { playerId: 'b', points: 0 },
        { playerId: 'c', points: 0.5 },
      ])
    );
    expect(result[0].playerId).toBe('a');
    expect(result[0].points).toBe(1.5);
  });
});
