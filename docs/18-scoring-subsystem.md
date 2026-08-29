# 成績計算子系統（Scoring Subsystem）

> 狀態：實作中  
> 來源：移植自 [Sched](https://github.com/5871224/Sched) 瑞士制計分核心，並補齊觀音盃象棋規則缺口。

## 1. 目標

- 裁判以 **整組戰績表（scoresheet）** 輸入每一輪比賽結果
- 計分／輔分／名次為可單元測試的純函式（`packages/scoring`）
- 棋種差異透過 `RulesPlugin.tiebreakSpec()` 宣告，不寫死在 Match／Tournament
- 支援可設定勝分、輪空給分、對手分取捨、扣分與技術犯規

## 2. 架構

```
裁判 UI (/referee/[id])
  → GET  /api/tournaments/:id/scoresheet
  → POST /api/tournaments/:id/scoresheet/batch-results
  → POST /api/matches/:id/result | fouls
  → POST /api/tournaments/:id/score-adjustments
         ↓
  RulesPlugin.normalizeMatchResult / scoreMatch(winPoint)
         ↓
  packages/scoring.computeScoresheet
         ↓
  戰績表列（總分、名次、輔分、usedTiebreakCount）
```

`packages/core.computeStandings` 仍保留原簽章，內部委派 scoring，供編排與既有 standings API 使用。

## 3. 輔分定義（TiebreakId）

| Id | 中文 | 計算 |
|---|---|---|
| `sos` | 對手分／對手總分和 | 所有對手總分之和；可搭配 `cut.keepTop` 取最高 N 輪 |
| `sodos` | 勝對手分 | `sum((己方得分/勝分) × 對手總分)` |
| `sodos_lost` | 所負對手總分和 | 當對手得分 ≥ 勝分時累加對手總分（**Sched 圍棋輔二現行行為**） |
| `head_to_head` | 彼此對戰 | 同分組內連通時，每局 `己方得分 − 勝分/2`；非單一連通則整組 0 |
| `wins` | 勝局數 | 勝場計數 |
| `second_wins` | 後手勝局 | 非先手且獲勝的局數 |
| `second_games` | 後手賽局 | 非先手的局數 |
| `sosos` | 強對手分／對手輔一和 | 對手 `sos` 之和 |
| `sosos_weighted` | 加權對手輔一 | `sum((己方得分/勝分) × 對手 sos)` |
| `sodos_of_sodos` | 對手輔二和 | 對手 `sodos` 之和 |
| `sodos_of_sodos_weighted` | 加權對手輔二 | `sum((己方得分/勝分) × 對手 sodos)` |
| `fouls_asc` | 技術犯規少者 | 犯規次數，**升序**（少者優先） |

## 4. 各棋種預設順序

### 五子棋 `gomoku`（7 級，預設勝分 1）

1. sos → 2. sodos → 3. head_to_head → 4. sosos → 5. sodos_of_sodos → 6. sosos_weighted → 7. sodos_of_sodos_weighted

### 象棋 `xiangqi`（7 級含犯規，預設勝分 2）

1. sos（可 `cut.keepTop`，觀音盃段位組取最高 7 輪）  
2. head_to_head  
3. wins  
4. second_wins  
5. second_games  
6. sosos  
7. fouls_asc

### 圍棋 `go`（4 級，預設勝分 1）

1. sos → 2. sodos_lost → 3. head_to_head → 4. sosos

### 西洋棋 `chess`（4 級，預設勝分 1）

1. sos → 2. head_to_head → 3. wins → 4. sosos

## 5. 觀音盃象棋規則對應

| 條文 | 系統對應 |
|---|---|
| 第 15 條積分 | `total_score`（含輪空給分、扣分調整） |
| 第 15 條對手分（段位組 9 輪取最高 7） | `sos` + `tournaments.sos_keep_top = 7` |
| 第 15 條兩人對賽勝者 | `head_to_head` |
| 第 15 條勝局多者 | `wins` |
| 第 15 條後手勝局／後手賽局 | `second_wins` / `second_games` |
| 第 15 條強對手分 | `sosos` |
| 第 15 條技術犯規少者 | `fouls_asc` ← `match_fouls` |
| 第 4 條行為扣 0.5 分 | `tournament_score_adjustments.delta = -0.5` |
| 第 11 條逾時未到判負 | `result.by = 'absence'` |
| 第 8/13 條兩次技術犯規判負 | `result.by = 'foul_limit'` |
| 輪空 | `matches.entry_kind = 'bye'`，給 `bye_point`（預設同 `win_point`） |

## 6. 實體與欄位

- `tournaments.win_point` / `bye_point` / `sos_keep_top`
- `matches.player_b_id` 可為 null（輪空）；`entry_kind ∈ {normal, bye, absent}`
- `registrations.seed_no` 籤號
- `match_fouls` 技術犯規計次
- `tournament_score_adjustments` 總成績加減分
- `match_result_audits` 改判軌跡

## 7. Sched 移植差異與已知疑點

1. **圍棋輔二 `sodos_lost`**：Sched 現行邏輯為「當對手得分 ≥ 勝分（即自己輸）時累加對手總分」。慣例 SODOS 應為所勝對手加權。本系統**照現行行為移植**並以測試標記；若確認為 bug 再改為標準 SODOS。
2. **輪空**：Sched 以 `player_b_id = NULL` + memo「輪空」落地；OneGo 改用 `entry_kind='bye'`。
3. **名次**：同分同名次（dense rank）；輔分欄僅顯示 `usedTiebreakCount` 實際用到的欄位。
4. **勝分**：象棋預設 2，其餘預設 1；建賽可覆寫 `win_point`。

## 8. 相關檔案

| 路徑 | 職責 |
|---|---|
| `packages/rules` | TiebreakSpec、defaultWinPoint、scoreMatch(winPoint) |
| `packages/scoring` | computeScoresheet、輔分引擎、黃金檔回歸 |
| `packages/core/standings.ts` | 薄包裝委派 scoring |
| `apps/api` | scoresheet／batch-results／fouls／adjustments／draw-seeds |
| `apps/web/.../referee/[id]` | 整組戰績表 UI |
| `docs/觀音盃象棋賽規則.png` | 規則原文 |
