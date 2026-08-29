import type { MatchOutcome, RatingConfig } from './types';

/** 期望得分：Elo logistic。 */
export function expectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

/** 單場 Elo 變化（四捨五入）。win=1 / draw=0.5 / loss=0。 */
export function calculateEloChange(args: {
  playerRating: number;
  opponentRating: number;
  matchResult: MatchOutcome;
  kFactor: number;
}): number {
  const { playerRating, opponentRating, matchResult, kFactor } = args;
  const expected = expectedScore(playerRating, opponentRating);
  const actual = matchResult === 'win' ? 1 : matchResult === 'draw' ? 0.5 : 0;
  return Math.round(kFactor * (actual - expected));
}

/** 依 rating 分級取 K 值；未命中任何 tier 時回 kFactorBase。 */
export function calculateKFactor(rating: number, config: RatingConfig): number {
  for (const tier of config.kFactorTiers) {
    if (tier.ratingBelow !== undefined && rating < tier.ratingBelow) return tier.k;
    if (tier.ratingAbove !== undefined && rating >= tier.ratingAbove) return tier.k;
  }
  return config.kFactorBase;
}

/** 夾在 [minRating, maxRating] 範圍內。 */
export function clampRating(rating: number, config: RatingConfig): number {
  let r = rating;
  if (config.minRating != null) r = Math.max(config.minRating, r);
  if (config.maxRating != null) r = Math.min(config.maxRating, r);
  return r;
}
