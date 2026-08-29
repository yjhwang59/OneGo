import type { TiebreakSpec, TiebreakSpecContext } from '../../types';
import { applySosCut, makeRulesPlugin } from '../_shared';

function tiebreakSpec(ctx?: TiebreakSpecContext): TiebreakSpec[] {
  return applySosCut(
    [
      { id: 'sos', label: '輔一', tip: '所有對手的總分和' },
      { id: 'head_to_head', label: '輔二', tip: '同分組彼此對戰成績（需單一連通）' },
      { id: 'wins', label: '輔三', tip: '勝局數' },
      { id: 'sosos', label: '輔四', tip: '所有對手的輔一之和' },
    ],
    ctx
  );
}

export const chessRulesV1 = makeRulesPlugin({
  gameKey: 'chess',
  defaultWinPoint: 1,
  tiebreakSpec,
});
