import type { TiebreakId, TiebreakSpec } from '@otc/rules';

/** 單局成績列（每位選手每輪一筆；輪空／缺席亦為一筆） */
export type ScoringEntry = {
  playerId: string;
  roundNo: number;
  /** 對手；輪空／缺席為 undefined */
  opponentId?: string;
  kind: 'normal' | 'bye' | 'absent';
  /** 該輪得分；未計分則 undefined */
  score?: number;
  /** 是否為先手（無對手列為 undefined） */
  isFirstMove?: boolean;
};

export type ScoringParticipant = {
  playerId: string;
  /** 籤號（同分完全相同時作末級排序） */
  seedNo?: number;
  withdrawn?: boolean;
};

export type ScoresheetRow = {
  playerId: string;
  seedNo?: number;
  withdrawn: boolean;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** 總分（含輪空給分與調整分） */
  points: number;
  /** 名次（同分同名次） */
  rank: number;
  tiebreaks: Record<string, number>;
};

export type ComputeScoresheetArgs = {
  participants: ScoringParticipant[];
  entries: ScoringEntry[];
  tiebreakSpec: TiebreakSpec[];
  winPoint: number;
  /** 總成績加減分（觀音盃第 4 條） */
  adjustments?: Record<string, number>;
  /** 技術犯規次數 */
  foulCounts?: Record<string, number>;
};

export type ComputeScoresheetResult = {
  rows: ScoresheetRow[];
  tiebreakSpec: TiebreakSpec[];
  usedTiebreakCount: number;
};

export type PairingRow = {
  playerAId: string;
  playerBId?: string | null;
  scoreA?: number | null;
  scoreB?: number | null;
  firstMove?: 'A' | 'B' | '-' | null;
  roundNo?: number;
};

/** 內部累計狀態 */
export type PlayerAccum = {
  playerId: string;
  seedNo?: number;
  withdrawn: boolean;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  tiebreaks: Record<TiebreakId | string, number>;
};
