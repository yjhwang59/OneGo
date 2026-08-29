import type { TiebreakSpec, TiebreakSpecContext } from '../../types';
import { applySosCut, makeRulesPlugin } from '../_shared';

function tiebreakSpec(ctx?: TiebreakSpecContext): TiebreakSpec[] {
  return applySosCut(
    [
      { id: 'sos', label: '輔一', tip: '所有對手的總分和（可取捨最高 N 輪）' },
      { id: 'head_to_head', label: '輔二', tip: '同分組彼此對戰成績（需單一連通）' },
      { id: 'wins', label: '輔三', tip: '勝局數' },
      { id: 'second_wins', label: '輔四', tip: '後手勝局數' },
      { id: 'second_games', label: '輔五', tip: '後手賽局數' },
      { id: 'sosos', label: '輔六', tip: '強對手分（對手輔一之和）' },
      { id: 'fouls_asc', label: '輔七', tip: '技術犯規少者優先', direction: 'asc' },
    ],
    ctx
  );
}

export const xiangqiRulesV1 = makeRulesPlugin({
  gameKey: 'xiangqi',
  defaultWinPoint: 2,
  tiebreakSpec,
});
