export type PairingParticipant = {
  playerId: string;
  currentPoints: number;
  /** 已對戰過的對手 playerId 列表（用於避免重複對局） */
  opponentIds: string[];
};

export type PairingConfig = {
  /** 是否避免已對戰過的兩人再次配對 */
  avoidRematches: boolean;
};

export type PairingPair = {
  playerAId: string;
  playerBId: string;
  tableNo: number;
};

export type BasicSwissPairingResult = {
  pairs: PairingPair[];
  byes: string[];
};

/** 先手方（A/B）標記於配對上，供象棋/圍棋/五子的先手平衡與輔分使用 */
export type FirstMove = 'A' | 'B';

export type RoundRobinPair = {
  playerAId: string;
  playerBId: string;
  tableNo: number;
  /** 先手方：本排程一律把先手者放為 playerA，故恆為 'A' */
  firstMove: FirstMove;
};

export type RoundRobinRound = {
  roundNo: number;
  pairs: RoundRobinPair[];
  byes: string[];
};

export type RoundRobinSchedule = RoundRobinRound[];
