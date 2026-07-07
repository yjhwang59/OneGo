import type { RoundRobinPair, RoundRobinRound, RoundRobinSchedule } from './types';

const BYE = '__BYE__';

/**
 * 單/雙循環賽程（circle / Berger 輪轉法）。
 * - 每位選手與其他人各對戰一次（雙循環為兩次，第二循環先後手互換）。
 * - 奇數人時每輪一人輪空（bye）。
 * - 先手（firstMove）於各輪交替平衡，先手者一律放為 playerA、firstMove='A'。
 *
 * 產生「整份賽程」；呼叫端依 roundNo 取該輪配對即可（對應 Sched SwissService::robin 的用途）。
 *
 * @param playerIds 參賽者（順序決定籤序；呼叫端應以穩定順序傳入以獲得可重現排程）
 */
export function roundRobinSchedule(playerIds: string[], opts: { double?: boolean } = {}): RoundRobinSchedule {
  const players = [...playerIds];
  if (players.length < 2) return [];
  if (players.length % 2 === 1) players.push(BYE);

  const n = players.length;
  const half = n / 2;
  const arr = [...players];
  const singleRounds = n - 1;
  const rounds: RoundRobinRound[] = [];

  for (let r = 0; r < singleRounds; r++) {
    const pairs: RoundRobinPair[] = [];
    const byes: string[] = [];
    let tableNo = 1;
    for (let i = 0; i < half; i++) {
      const p1 = arr[i]!;
      const p2 = arr[n - 1 - i]!;
      if (p1 === BYE || p2 === BYE) {
        byes.push(p1 === BYE ? p2 : p1);
        continue;
      }
      // 先手交替：以 (round + slot) 奇偶決定哪一方為先手（playerA）
      const p1First = (r + i) % 2 === 0;
      pairs.push({
        playerAId: p1First ? p1 : p2,
        playerBId: p1First ? p2 : p1,
        tableNo: tableNo++,
        firstMove: 'A'
      });
    }
    rounds.push({ roundNo: r + 1, pairs, byes });
    // 固定第一位，其餘順時針旋轉一格
    arr.splice(1, 0, arr.pop()!);
  }

  if (opts.double) {
    const base = rounds.length;
    for (let r = 0; r < base; r++) {
      const src = rounds[r]!;
      rounds.push({
        roundNo: base + r + 1,
        byes: [...src.byes],
        // 第二循環先後手互換
        pairs: src.pairs.map((p) => ({
          playerAId: p.playerBId,
          playerBId: p.playerAId,
          tableNo: p.tableNo,
          firstMove: 'A' as const
        }))
      });
    }
  }

  return rounds;
}
