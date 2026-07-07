import { describe, it, expect } from 'vitest';
import { goRulesV1 } from './v1';

describe('goRulesV1', () => {
  describe('validateMatchResult', () => {
    it('accepts object with kind win/draw/void', () => {
      expect(goRulesV1.validateMatchResult({ kind: 'win', winner: 'A' })).toEqual({ ok: true });
      expect(goRulesV1.validateMatchResult({ kind: 'draw' })).toEqual({ ok: true });
      expect(goRulesV1.validateMatchResult({ kind: 'void' })).toEqual({ ok: true });
    });

    it('rejects non-object or null', () => {
      expect(goRulesV1.validateMatchResult(null)).toEqual({ ok: false, code: 'INVALID', message: 'result 必須是物件' });
      expect(goRulesV1.validateMatchResult(1)).toEqual({ ok: false, code: 'INVALID', message: 'result 必須是物件' });
    });

    it('rejects invalid kind', () => {
      expect(goRulesV1.validateMatchResult({ kind: 'invalid' })).toEqual({
        ok: false,
        code: 'INVALID_KIND',
        message: 'kind 不合法',
      });
    });
  });

  describe('normalizeMatchResult', () => {
    it('returns result when valid', () => {
      const input = { kind: 'win', winner: 'A' as const, by: 'resign' };
      const out = goRulesV1.normalizeMatchResult(input);
      expect(out.ok).toBe(true);
      if (out.ok) expect(out.result).toEqual(input);
    });

    it('returns error when invalid', () => {
      const out = goRulesV1.normalizeMatchResult(null);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.code).toBe('INVALID');
    });
  });

  describe('scoreMatch', () => {
    it('win A => A:1, B:0', () => {
      expect(goRulesV1.scoreMatch({ result: { kind: 'win', winner: 'A' } })).toEqual({
        A: { points: 1 },
        B: { points: 0 },
      });
    });

    it('win B => A:0, B:1', () => {
      expect(goRulesV1.scoreMatch({ result: { kind: 'win', winner: 'B' } })).toEqual({
        A: { points: 0 },
        B: { points: 1 },
      });
    });

    it('draw => 0.5 each', () => {
      expect(goRulesV1.scoreMatch({ result: { kind: 'draw' } })).toEqual({
        A: { points: 0.5 },
        B: { points: 0.5 },
      });
    });

    it('void => 0 each', () => {
      expect(goRulesV1.scoreMatch({ result: { kind: 'void' } })).toEqual({
        A: { points: 0 },
        B: { points: 0 },
      });
    });
  });
});
