import type { BasicSwissPairingResult, PairingConfig, PairingParticipant, PairingPair } from './types';

/**
 * 基礎瑞士制配對：依當前積分分組，同分組內配對，避免重複對局，奇數時一人輪空（bye）。
 * 若 avoidRematches 下無法配出任何對局（例如僅 2 人且已對戰過），則改為允許重賽以產出該輪對局。
 */
export function basicSwissPairing(
  participants: PairingParticipant[],
  config: PairingConfig = { avoidRematches: true }
): BasicSwissPairingResult {
  if (participants.length === 0) return { pairs: [], byes: [] };
  if (participants.length === 1) return { pairs: [], byes: [participants[0]!.playerId] };

  let result = runPairing(participants, config.avoidRematches);
  if (result.pairs.length === 0 && result.byes.length === participants.length && config.avoidRematches) {
    result = runPairing(participants, false);
  }
  return result;
}

function runPairing(participants: PairingParticipant[], avoidRematches: boolean): BasicSwissPairingResult {
  const byPoints = new Map<number, PairingParticipant[]>();
  for (const p of participants) {
    const pts = p.currentPoints;
    if (!byPoints.has(pts)) byPoints.set(pts, []);
    byPoints.get(pts)!.push(p);
  }
  const sortedPoints = [...byPoints.keys()].sort((a, b) => b - a);

  const pairs: PairingPair[] = [];
  let unpaired: PairingParticipant[] = [];
  let tableNo = 1;

  for (const pts of sortedPoints) {
    const group = byPoints.get(pts)!;
    const combined = [...unpaired, ...group];
    unpaired = [];

    const { paired, remaining } = pairWithinGroup(combined, avoidRematches);
    for (const pair of paired) {
      pairs.push({ playerAId: pair.a.playerId, playerBId: pair.b.playerId, tableNo: tableNo++ });
    }
    unpaired = remaining;
  }

  const byes = unpaired.map((p) => p.playerId);
  return { pairs, byes };
}

function pairWithinGroup(
  group: PairingParticipant[],
  avoidRematches: boolean
): { paired: Array<{ a: PairingParticipant; b: PairingParticipant }>; remaining: PairingParticipant[] } {
  const paired: Array<{ a: PairingParticipant; b: PairingParticipant }> = [];
  const remaining: PairingParticipant[] = [];
  const used = new Set<string>();

  const list = [...group];
  while (list.length >= 2) {
    const a = list.shift()!;
    if (used.has(a.playerId)) continue;
    let found: PairingParticipant | null = null;
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      const b = list[i]!;
      if (used.has(b.playerId)) continue;
      if (avoidRematches && a.opponentIds.includes(b.playerId)) continue;
      found = b;
      idx = i;
      break;
    }
    if (found) {
      list.splice(idx, 1);
      used.add(a.playerId);
      used.add(found.playerId);
      paired.push({ a, b: found });
    } else {
      remaining.push(a);
    }
  }
  if (list.length === 1) remaining.push(list[0]!);
  return { paired, remaining };
}
