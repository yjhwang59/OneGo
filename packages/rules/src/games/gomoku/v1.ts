import type { TiebreakSpec, TiebreakSpecContext } from '../../types';
import { applySosCut, makeRulesPlugin } from '../_shared';

function tiebreakSpec(ctx?: TiebreakSpecContext): TiebreakSpec[] {
  return applySosCut(
    [
      { id: 'sos', label: '輔一', tip: '所有對手的總分和' },
      { id: 'sodos', label: '輔二', tip: '所勝對手總分 + 所和對手總分×0.5' },
      { id: 'head_to_head', label: '輔三', tip: '同分組彼此對戰成績（需單一連通）' },
      { id: 'sosos', label: '輔四', tip: '所有對手的輔一之和' },
      { id: 'sodos_of_sodos', label: '輔五', tip: '所有對手的輔二之和' },
      { id: 'sosos_weighted', label: '輔六', tip: '所勝對手輔一 + 所和對手輔一×0.5' },
      {
        id: 'sodos_of_sodos_weighted',
        label: '輔七',
        tip: '所勝對手輔二 + 所和對手輔二×0.5',
      },
    ],
    ctx
  );
}

export const gomokuRulesV1 = makeRulesPlugin({
  gameKey: 'gomoku',
  defaultWinPoint: 1,
  tiebreakSpec,
});
