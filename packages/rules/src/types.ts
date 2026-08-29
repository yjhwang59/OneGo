export type GameKey = 'go' | 'chess' | 'xiangqi' | 'gomoku';

export type RulesetVersion = string;

export type MatchSide = 'A' | 'B';

/**
 * 對局結果（正規化）
 * - 核心原則：後端 Match 只存此「正規化結果」的 JSON，不存各棋種的細節欄位
 * - 若某棋種需要額外資訊（例如盤面/棋譜/提子/時間），應放在 `meta`，由 rulesetVersion 控制其 schema
 */
export type NormalizedMatchResult =
  | {
      kind: 'win';
      winner: MatchSide;
      by?: 'resign' | 'timeout' | 'score' | 'checkmate' | 'adjudication' | 'absence' | 'foul_limit';
      meta?: Record<string, unknown>;
    }
  | {
      kind: 'draw';
      by?: 'agreement' | 'stalemate' | 'repetition' | 'timeout' | 'adjudication';
      meta?: Record<string, unknown>;
    }
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

/** 輔分識別碼（宣告於 RulesPlugin.tiebreakSpec） */
export type TiebreakId =
  | 'sos'
  | 'sodos'
  | 'sodos_lost'
  | 'head_to_head'
  | 'wins'
  | 'second_wins'
  | 'second_games'
  | 'sosos'
  | 'sosos_weighted'
  | 'sodos_of_sodos'
  | 'sodos_of_sodos_weighted'
  | 'fouls_asc';

export type TiebreakSpec = {
  id: TiebreakId;
  /** 顯示標籤，如「輔一」「對手分」 */
  label: string;
  /** 欄頭提示文字 */
  tip: string;
  /** 排序方向；預設 desc（大者優先）；fouls_asc 用 asc */
  direction?: 'desc' | 'asc';
  /** 對手分取捨：只取最高 N 輪對手分（觀音盃段位組） */
  cut?: { keepTop: number };
};

export type TiebreakSpecContext = {
  roundCount?: number;
  /** 對手分取捨輪數（覆寫規格預設；通常來自 tournaments.sos_keep_top） */
  sosKeepTop?: number | null;
};

export type RulesPlugin = {
  gameKey: GameKey;
  rulesetVersion: RulesetVersion;

  /** 預設勝分（go/chess/gomoku=1, xiangqi=2） */
  defaultWinPoint: number;

  /** 校驗輸入結果是否符合此棋種/版本規則 */
  validateMatchResult: (input: unknown) => ValidateResult;

  /** 將任意輸入（通常來自 API）轉成正規化結果（若可） */
  normalizeMatchResult: (
    input: unknown
  ) => { ok: true; result: NormalizedMatchResult } | { ok: false; error: ValidateError };

  /** 計算單場對局對雙方的分數；winPoint 未給時用 defaultWinPoint */
  scoreMatch: (args: {
    result: NormalizedMatchResult;
    winPoint?: number;
  }) => { A: Score; B: Score };

  /** 依棋種宣告輔分順序與說明 */
  tiebreakSpec: (ctx?: TiebreakSpecContext) => TiebreakSpec[];
};
