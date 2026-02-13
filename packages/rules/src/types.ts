export type GameKey = 'go' | 'chess' | 'xiangqi' | 'gomoku';

export type RulesetVersion = string;

export type MatchSide = 'A' | 'B';

/**
 * 對局結果（正規化）
 * - 核心原則：後端 Match 只存此「正規化結果」的 JSON，不存各棋種的細節欄位
 * - 若某棋種需要額外資訊（例如盤面/棋譜/提子/時間），應放在 `meta`，由 rulesetVersion 控制其 schema
 */
export type NormalizedMatchResult =
  | { kind: 'win'; winner: MatchSide; by?: 'resign' | 'timeout' | 'score' | 'checkmate' | 'adjudication'; meta?: Record<string, unknown> }
  | { kind: 'draw'; by?: 'agreement' | 'stalemate' | 'repetition' | 'timeout' | 'adjudication'; meta?: Record<string, unknown> }
  | { kind: 'void'; reason?: 'manual' | 'pairing_change' | 'invalid'; meta?: Record<string, unknown> };

export type ValidateError = { ok: false; code: string; message: string };

export type ValidateResult = { ok: true } | ValidateError;

export type Score = {
  points: number;
  meta?: Record<string, unknown>;
};

export type StandingsRow = {
  playerId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  tiebreaks?: Record<string, number>;
};

export type RulesPlugin = {
  gameKey: GameKey;
  rulesetVersion: RulesetVersion;

  /** 校驗輸入結果是否符合此棋種/版本規則 */
  validateMatchResult: (input: unknown) => ValidateResult;

  /** 將任意輸入（通常來自 API）轉成正規化結果（若可） */
  normalizeMatchResult: (input: unknown) => { ok: true; result: NormalizedMatchResult } | { ok: false; error: ValidateError };

  /** 計算單場對局對雙方的分數（例如勝=1 和=0.5 負=0） */
  scoreMatch: (args: { result: NormalizedMatchResult }) => { A: Score; B: Score };
};


