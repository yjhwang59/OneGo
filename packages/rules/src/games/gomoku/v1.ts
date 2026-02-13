import type { NormalizedMatchResult, RulesPlugin, ValidateError, ValidateResult } from '../../types';

function ok(): ValidateResult {
  return { ok: true };
}

function err(code: string, message: string): ValidateError {
  return { ok: false, code, message };
}

export const gomokuRulesV1: RulesPlugin = {
  gameKey: 'gomoku',
  rulesetVersion: 'v1',
  validateMatchResult(input: unknown): ValidateResult {
    if (typeof input !== 'object' || input === null) return err('INVALID', 'result 必須是物件');
    const kind = (input as any).kind;
    if (kind !== 'win' && kind !== 'draw' && kind !== 'void') return err('INVALID_KIND', 'kind 不合法');
    return ok();
  },
  normalizeMatchResult(input: unknown) {
    const v = this.validateMatchResult(input);
    if (!v.ok) return { ok: false as const, error: v };
    return { ok: true as const, result: input as NormalizedMatchResult };
  },
  scoreMatch({ result }: { result: NormalizedMatchResult }) {
    if (result.kind === 'win') {
      return result.winner === 'A'
        ? { A: { points: 1 }, B: { points: 0 } }
        : { A: { points: 0 }, B: { points: 1 } };
    }
    if (result.kind === 'draw') return { A: { points: 0.5 }, B: { points: 0.5 } };
    return { A: { points: 0 }, B: { points: 0 } };
  }
};


