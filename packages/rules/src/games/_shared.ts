import type {
  NormalizedMatchResult,
  RulesPlugin,
  Score,
  TiebreakSpec,
  TiebreakSpecContext,
  ValidateError,
  ValidateResult,
} from '../types';

export function ok(): ValidateResult {
  return { ok: true };
}

export function err(code: string, message: string): ValidateError {
  return { ok: false, code, message };
}

export function validateBasicResult(input: unknown): ValidateResult {
  if (typeof input !== 'object' || input === null) return err('INVALID', 'result 必須是物件');
  const kind = (input as { kind?: unknown }).kind;
  if (kind !== 'win' && kind !== 'draw' && kind !== 'void') return err('INVALID_KIND', 'kind 不合法');
  if (kind === 'win') {
    const winner = (input as { winner?: unknown }).winner;
    if (winner !== 'A' && winner !== 'B') return err('INVALID_WINNER', 'winner 必須是 A 或 B');
  }
  return ok();
}

/** 依勝分計算單場分數：勝=winPoint、和=winPoint/2、負/作廢=0 */
export function scoreWithWinPoint(
  result: NormalizedMatchResult,
  winPoint: number
): { A: Score; B: Score } {
  const wp = winPoint > 0 ? winPoint : 1;
  if (result.kind === 'win') {
    return result.winner === 'A'
      ? { A: { points: wp }, B: { points: 0 } }
      : { A: { points: 0 }, B: { points: wp } };
  }
  if (result.kind === 'draw') return { A: { points: wp / 2 }, B: { points: wp / 2 } };
  return { A: { points: 0 }, B: { points: 0 } };
}

export function applySosCut(
  specs: TiebreakSpec[],
  ctx?: TiebreakSpecContext
): TiebreakSpec[] {
  if (ctx?.sosKeepTop == null || ctx.sosKeepTop <= 0) return specs;
  return specs.map((s) =>
    s.id === 'sos' ? { ...s, cut: { keepTop: ctx.sosKeepTop! } } : s
  );
}

export function makeRulesPlugin(args: {
  gameKey: RulesPlugin['gameKey'];
  rulesetVersion?: string;
  defaultWinPoint: number;
  tiebreakSpec: (ctx?: TiebreakSpecContext) => TiebreakSpec[];
}): RulesPlugin {
  return {
    gameKey: args.gameKey,
    rulesetVersion: args.rulesetVersion ?? 'v1',
    defaultWinPoint: args.defaultWinPoint,
    validateMatchResult: validateBasicResult,
    normalizeMatchResult(input: unknown) {
      const v = validateBasicResult(input);
      if (!v.ok) return { ok: false as const, error: v };
      return { ok: true as const, result: input as NormalizedMatchResult };
    },
    scoreMatch({ result, winPoint }) {
      return scoreWithWinPoint(result, winPoint ?? args.defaultWinPoint);
    },
    tiebreakSpec: args.tiebreakSpec,
  };
}
