import type { TiebreakSpec, TiebreakSpecContext } from '../../types';
import { applySosCut, makeRulesPlugin } from '../_shared';

function tiebreakSpec(ctx?: TiebreakSpecContext): TiebreakSpec[] {
  return applySosCut(
    [
      { id: 'sos', label: '輔一', tip: '所有對手的總分和' },
      {
        id: 'sodos_lost',
        label: '輔二',
        tip: '所負對手總分和（Sched 圍棋現行：對手得分≥勝分時累加對手總分）',
      },
      { id: 'head_to_head', label: '輔三', tip: '同分組彼此對戰成績（需單一連通）' },
      { id: 'sosos', label: '輔四', tip: '所有對手的輔一（sos）之和' },
    ],
    ctx
  );
}

export const goRulesV1 = makeRulesPlugin({
  gameKey: 'go',
  defaultWinPoint: 1,
  tiebreakSpec,
});
