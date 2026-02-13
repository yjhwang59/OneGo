import type { RulesPlugin } from '@otc/rules';
import { chessRulesV1, goRulesV1, gomokuRulesV1, xiangqiRulesV1 } from '@otc/rules';

const plugins: RulesPlugin[] = [goRulesV1, chessRulesV1, xiangqiRulesV1, gomokuRulesV1];

export function getRulesPlugin(args: { gameKey: string; rulesetVersion: string }): RulesPlugin | undefined {
  return plugins.find((p) => p.gameKey === args.gameKey && p.rulesetVersion === args.rulesetVersion);
}




