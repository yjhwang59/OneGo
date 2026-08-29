import { describe, expect, it } from 'vitest';

import { calculateEloChange, calculateKFactor, expectedScore } from './elo-calculator';
import { DEFAULT_RATING_CONFIG } from './types';

describe('expectedScore', () => {
  it('equal ratings -> 0.5', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 6);
  });
  it('higher rating -> >0.5', () => {
    expect(expectedScore(1700, 1500)).toBeGreaterThan(0.5);
  });
});

describe('calculateEloChange', () => {
  it('equal ratings, win with K=32 -> +16', () => {
    expect(calculateEloChange({ playerRating: 1500, opponentRating: 1500, matchResult: 'win', kFactor: 32 })).toBe(16);
  });
  it('equal ratings, loss with K=32 -> -16', () => {
    expect(calculateEloChange({ playerRating: 1500, opponentRating: 1500, matchResult: 'loss', kFactor: 32 })).toBe(-16);
  });
  it('equal ratings, draw -> 0', () => {
    expect(calculateEloChange({ playerRating: 1500, opponentRating: 1500, matchResult: 'draw', kFactor: 32 })).toBe(0);
  });
  it('winner gain and loser loss are opposite for equal K', () => {
    const a = calculateEloChange({ playerRating: 1600, opponentRating: 1500, matchResult: 'win', kFactor: 32 });
    const b = calculateEloChange({ playerRating: 1500, opponentRating: 1600, matchResult: 'loss', kFactor: 32 });
    expect(a).toBe(-b);
  });
  it('underdog win yields larger gain than favorite win', () => {
    const underdog = calculateEloChange({ playerRating: 1400, opponentRating: 1600, matchResult: 'win', kFactor: 32 });
    const favorite = calculateEloChange({ playerRating: 1600, opponentRating: 1400, matchResult: 'win', kFactor: 32 });
    expect(underdog).toBeGreaterThan(favorite);
  });
});

describe('calculateKFactor', () => {
  it('tiers by rating', () => {
    expect(calculateKFactor(1500, DEFAULT_RATING_CONFIG)).toBe(40); // <2000
    expect(calculateKFactor(2100, DEFAULT_RATING_CONFIG)).toBe(32); // <2400
    expect(calculateKFactor(2500, DEFAULT_RATING_CONFIG)).toBe(24); // >=2400
  });
});
