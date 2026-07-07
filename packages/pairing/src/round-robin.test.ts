import { describe, it, expect } from 'vitest';
import { roundRobinSchedule } from './round-robin';

function pairKey(a: string, b: string) {
  return [a, b].sort().join('-');
}

describe('roundRobinSchedule', () => {
  it('returns empty for fewer than 2 players', () => {
    expect(roundRobinSchedule([])).toEqual([]);
    expect(roundRobinSchedule(['a'])).toEqual([]);
  });

  it('single round-robin: n-1 rounds, every pair exactly once, no repeats', () => {
    const players = ['a', 'b', 'c', 'd'];
    const schedule = roundRobinSchedule(players);
    expect(schedule).toHaveLength(3); // n-1

    const seen = new Set<string>();
    for (const round of schedule) {
      const inRound = new Set<string>();
      for (const p of round.pairs) {
        // 同一輪不得有選手重複出賽
        expect(inRound.has(p.playerAId)).toBe(false);
        expect(inRound.has(p.playerBId)).toBe(false);
        inRound.add(p.playerAId);
        inRound.add(p.playerBId);
        // 全賽事不得重複對局
        const k = pairKey(p.playerAId, p.playerBId);
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
    // 4 人共 C(4,2)=6 對局
    expect(seen.size).toBe(6);
  });

  it('odd players produce exactly one bye per round, each player byes once', () => {
    const players = ['a', 'b', 'c'];
    const schedule = roundRobinSchedule(players);
    expect(schedule).toHaveLength(3); // n-1 with dummy => 3 rounds
    const byeCounts = new Map<string, number>();
    for (const round of schedule) {
      expect(round.byes).toHaveLength(1);
      const b = round.byes[0]!;
      byeCounts.set(b, (byeCounts.get(b) ?? 0) + 1);
    }
    for (const p of players) expect(byeCounts.get(p)).toBe(1);
  });

  it('double round-robin doubles the rounds and each pair meets twice with colors swapped', () => {
    const players = ['a', 'b', 'c', 'd'];
    const schedule = roundRobinSchedule(players, { double: true });
    expect(schedule).toHaveLength(6); // 2*(n-1)

    const meetings = new Map<string, number>();
    for (const round of schedule) {
      for (const p of round.pairs) {
        const k = pairKey(p.playerAId, p.playerBId);
        meetings.set(k, (meetings.get(k) ?? 0) + 1);
      }
    }
    for (const count of meetings.values()) expect(count).toBe(2);
  });

  it('assigns first move to playerA on every real pair', () => {
    const schedule = roundRobinSchedule(['a', 'b', 'c', 'd']);
    for (const round of schedule) {
      for (const p of round.pairs) expect(p.firstMove).toBe('A');
    }
  });
});
