import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { goRulesV1, xiangqiRulesV1, type RulesPlugin } from '@otc/rules';
import { computeScoresheetWithRules, type ScoringEntry } from './index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const live = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/sched-live-cases.json'), 'utf8')
) as {
  cases: Array<{
    label: string;
    tournament: { game_type: string; win_point: number };
    players: Array<{ draw_no: number; withdrawn?: boolean }>;
    history: Array<{
      round: number;
      a: number;
      b: number | null;
      first: string | null;
      memo: string | null;
      score_a: number | null;
      score_b: number | null;
    }>;
    expected_sorted: Array<{ draw: number; score: string; tb1: string }>;
  }>;
};

const golden = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/sched-standings-golden.json'), 'utf8')
) as {
  cases: Record<
    string,
    Array<{
      draw: number;
      score: string;
      tb1: string;
      tb2: string;
      tb3: string;
      tb4: string;
      tb5: string;
      tb6: string;
      tb7: string;
      rank: number;
    }>
  >;
};

function rulesFor(gameType: string): RulesPlugin {
  if (gameType === '象棋') return xiangqiRulesV1;
  if (gameType === '圍棋') return goRulesV1;
  throw new Error(`unsupported game_type ${gameType}`);
}

function historyToEntries(
  history: (typeof live.cases)[0]['history'],
  throughRound: number
): ScoringEntry[] {
  const out: ScoringEntry[] = [];
  for (const h of history) {
    if (h.round > throughRound) continue;
    const aId = String(h.a);
    if (h.b == null || h.memo === '輪空' || h.memo === '棄賽') {
      if (h.score_a != null) {
        out.push({
          playerId: aId,
          roundNo: h.round,
          kind: h.memo === '棄賽' ? 'absent' : 'bye',
          score: Number(h.score_a),
        });
      }
      continue;
    }
    const bId = String(h.b);
    const fm = (h.first ?? '').toUpperCase();
    out.push({
      playerId: aId,
      roundNo: h.round,
      opponentId: bId,
      kind: 'normal',
      score: h.score_a == null ? undefined : Number(h.score_a),
      isFirstMove: fm === 'A' ? true : fm === 'B' ? false : undefined,
    });
    out.push({
      playerId: bId,
      roundNo: h.round,
      opponentId: aId,
      kind: 'normal',
      score: h.score_b == null ? undefined : Number(h.score_b),
      isFirstMove: fm === 'B' ? true : fm === 'A' ? false : undefined,
    });
  }
  return out;
}

const TB_KEYS: Record<string, string[]> = {
  圍棋: ['sos', 'sodos_lost', 'head_to_head', 'sosos'],
  象棋: ['sos', 'head_to_head', 'wins', 'second_wins', 'second_games', 'sosos'],
};

describe('Sched live cases standings regression', () => {
  for (const c of live.cases) {
    it(`${c.label} (${c.tournament.game_type}) matches golden scores/tiebreaks/rank`, () => {
      const rules = rulesFor(c.tournament.game_type);
      const throughRound = Math.max(...c.history.map((h) => h.round));
      const entries = historyToEntries(c.history, throughRound);
      const result = computeScoresheetWithRules({
        participants: c.players.map((p) => ({
          playerId: String(p.draw_no),
          seedNo: p.draw_no,
          withdrawn: !!p.withdrawn,
        })),
        entries,
        rules,
        winPoint: c.tournament.win_point,
      });

      const expected = golden.cases[c.label];
      expect(expected).toBeTruthy();
      const keys = TB_KEYS[c.tournament.game_type] ?? [];
      const byDraw = new Map(result.rows.map((r) => [Number(r.playerId), r]));

      for (const exp of expected) {
        const row = byDraw.get(exp.draw);
        expect(row, `draw ${exp.draw}`).toBeTruthy();
        expect(row!.points).toBeCloseTo(Number(exp.score), 4);
        expect(row!.rank).toBe(exp.rank);
        const tbs = [exp.tb1, exp.tb2, exp.tb3, exp.tb4, exp.tb5, exp.tb6, exp.tb7];
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i]!;
          expect(row!.tiebreaks[key] ?? 0, `${c.label} draw=${exp.draw} ${key}`).toBeCloseTo(
            Number(tbs[i]),
            3
          );
        }
      }
    });
  }
});
