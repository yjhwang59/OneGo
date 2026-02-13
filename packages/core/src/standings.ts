import type { RulesPlugin } from '@otc/rules';
import type { NormalizedMatchResult } from '@otc/rules';

export type FinishedMatch = {
  playerAId: string;
  playerBId: string;
  result: NormalizedMatchResult;
};

export type StandingsRow = {
  playerId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
};

export function computeStandings(args: { participants: string[]; matches: FinishedMatch[]; rules: RulesPlugin }): StandingsRow[] {
  const rows = new Map<string, StandingsRow>();
  for (const pid of args.participants) rows.set(pid, { playerId: pid, played: 0, wins: 0, draws: 0, losses: 0, points: 0 });

  for (const m of args.matches) {
    const r = m.result;
    const score = args.rules.scoreMatch({ result: r });
    const a = rows.get(m.playerAId);
    const b = rows.get(m.playerBId);
    if (a) {
      a.played += 1;
      a.points += score.A.points;
      if (r.kind === 'win') a[r.winner === 'A' ? 'wins' : 'losses'] += 1;
      if (r.kind === 'draw') a.draws += 1;
    }
    if (b) {
      b.played += 1;
      b.points += score.B.points;
      if (r.kind === 'win') b[r.winner === 'B' ? 'wins' : 'losses'] += 1;
      if (r.kind === 'draw') b.draws += 1;
    }
  }

  return [...rows.values()].sort((x, y) => y.points - x.points);
}

export function computePublicPoints(args: { matches: FinishedMatch[]; rules: RulesPlugin }): Array<{ playerId: string; points: number }> {
  const points = new Map<string, number>();
  for (const m of args.matches) {
    const score = args.rules.scoreMatch({ result: m.result });
    points.set(m.playerAId, (points.get(m.playerAId) ?? 0) + score.A.points);
    points.set(m.playerBId, (points.get(m.playerBId) ?? 0) + score.B.points);
  }
  return [...points.entries()].map(([playerId, points]) => ({ playerId, points })).sort((a, b) => b.points - a.points);
}




