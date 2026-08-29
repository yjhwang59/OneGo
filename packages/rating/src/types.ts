export type GameKey = 'go' | 'chess' | 'xiangqi' | 'gomoku';
export type MatchOutcome = 'win' | 'draw' | 'loss';

export type KFactorTier = {
  /** rating 低於此值時適用（擇先命中） */
  ratingBelow?: number;
  /** rating 大於等於此值時適用 */
  ratingAbove?: number;
  k: number;
};

export type RatingConfig = {
  gameKey: GameKey;
  defaultRating: number;
  kFactorBase: number;
  kFactorTiers: KFactorTier[];
  minRating: number;
  maxRating?: number | null;
};

export type PlayerRating = {
  playerId: string;
  gameKey: GameKey;
  currentRating: number;
  peakRating: number;
  lowestRating: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
};

export type RatingChange = {
  playerId: string;
  ratingBefore: number;
  ratingAfter: number;
  ratingChange: number;
  kFactorUsed: number;
  opponentRating: number;
  matchResult: MatchOutcome;
};

export const DEFAULT_RATING_CONFIG: RatingConfig = {
  gameKey: 'go',
  defaultRating: 1500,
  kFactorBase: 32,
  kFactorTiers: [
    { ratingBelow: 2000, k: 40 },
    { ratingBelow: 2400, k: 32 },
    { ratingAbove: 2400, k: 24 },
  ],
  minRating: 100,
  maxRating: null,
};
