# @otc/rules（草案）

## 目標
- 將「棋種差異」隔離在 rules 外掛：結果正規化、合法性校驗、計分/同分判定（tiebreak）
- 核心 `Tournament/Match` 不依賴特定棋種細節，只持有 `gameKey` 與 `rulesetVersion`

## 核心概念
- `GameKey`：`go` / `chess` / `xiangqi` / `gomoku`
- `rulesetVersion`：例如 `v1`
- `NormalizedMatchResult`：正規化結果（勝/負/和/棄權…），由各棋種 ruleset 定義




