import { describe, it, expect } from 'vitest';
import { basicSwissPairing } from './basic-swiss';

describe('basicSwissPairing', () => {
  it('returns empty pairs and byes for no participants', () => {
    const result = basicSwissPairing([]);
    expect(result.pairs).toHaveLength(0);
    expect(result.byes).toHaveLength(0);
  });

  it('returns one bye for single participant', () => {
    const result = basicSwissPairing([{ playerId: 'a', currentPoints: 0, opponentIds: [] }]);
    expect(result.pairs).toHaveLength(0);
    expect(result.byes).toEqual(['a']);
  });

  it('pairs two participants with same points', () => {
    const result = basicSwissPairing(
      [
        { playerId: 'a', currentPoints: 0, opponentIds: [] },
        { playerId: 'b', currentPoints: 0, opponentIds: [] },
      ],
      { avoidRematches: true }
    );
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]!.playerAId).toBe('a');
    expect(result.pairs[0]!.playerBId).toBe('b');
    expect(result.pairs[0]!.tableNo).toBe(1);
    expect(result.byes).toHaveLength(0);
  });

  it('groups by points and pairs within group', () => {
    const result = basicSwissPairing(
      [
        { playerId: 'a', currentPoints: 2, opponentIds: [] },
        { playerId: 'b', currentPoints: 2, opponentIds: [] },
        { playerId: 'c', currentPoints: 0, opponentIds: [] },
        { playerId: 'd', currentPoints: 0, opponentIds: [] },
      ],
      { avoidRematches: true }
    );
    expect(result.pairs).toHaveLength(2);
    expect(result.byes).toHaveLength(0);
    const ids = new Set(result.pairs.flatMap((p) => [p.playerAId, p.playerBId]));
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).toContain('c');
    expect(ids).toContain('d');
  });
});
