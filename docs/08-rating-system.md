# ELO 等級分系統（Phase 1 MVP 落地設計）

> 依據「瑞士制配對與 ELO 等級分系統規劃」文件，並校準本專案現況後定稿。
> 本文只涵蓋 **ELO 等級分**（配對已在 `packages/pairing` 實作）。範圍為 Phase 1：核心計算＋資料模型＋手動觸發＋查詢/排行榜 API＋最小前端。

## 0. 與規劃文件的差異（校準本專案現況）

1. **型別修正（必要）**：本專案 `users.id` 為 `text`（帳號可為 `player-01`、Google sub），**非 uuid**。所有參照 `users(id)` 的欄位一律用 `text`：`player_ratings.player_id`、`rating_history.created_by`、`rating_calculation_jobs.triggered_by`。`tournament_id`/`match_id` 維持 `uuid`（`tournaments.id`/`matches.id` 為 uuid）。
2. **資料存取走 DataSource**：不直接在 batch-processor 讀寫 DB；一律經 [apps/api/src/data.ts](../apps/api/src/data.ts) 的 `DataSource`＋Repository，並提供 InMemory 實作（維持「無 DB 也能跑」）。
3. **冪等（重要）**：計算採「**每賽事一次性**」。同一 `(tournament_id, game_key)` 已有 `completed` job 時，`POST calculate-ratings` 回 `409 ALREADY_RATED`（MVP 不支援重算；更正對局後的全域重算列為 Phase 2）。避免重複點擊造成分數重複加減。
4. **結果解讀**：沿用 rules 正規化結果 `{ kind:'win'|'draw'|'void', winner:'A'|'B' }`；`void` 不計分；BYE 不會產生 match（配對另存），故無需特別排除。
5. **前端路徑對應**：規劃用 `organizer/…`、`profile/…`；本專案改為 `admin/…`（作戰台）與 `me/…`，並新增公開排行榜 `/ratings/[gameKey]`。

## 1. 資料模型（db/schema/rating.sql，新增；`npm run db:apply` 會一併套用）

- `rating_configs`：每棋種一組（`game_key` enum、`default_rating` 1500、`k_factor_tiers` jsonb）。
- `player_ratings`：`(player_id text, game_key)` 唯一；`current/peak/lowest_rating`、`games/wins/draws/losses`。
- `rating_history`：每次變化一列（`rating_before/after/change`、`k_factor_used`、`opponent_rating`、`match_result`、`match_id`、`tournament_id`）。
- `rating_calculation_jobs`：手動觸發任務（`pending/processing/completed/failed`）；`(tournament_id, game_key)` 完成後即鎖定重算。

## 2. 核心套件 packages/rating（純函式，可測試）

- `types.ts`：`RatingConfig`、`PlayerRating`、`RatingChange`。
- `elo-calculator.ts`：
  - `calculateEloChange({playerRating, opponentRating, matchResult, kFactor})` → `round(K*(actual-expected))`，`expected = 1/(1+10^((opp-me)/400))`。
  - `calculateKFactor(rating, config)` → 依 `kFactorTiers` 分級。
- `index.ts` 匯出上述；不含 I/O（DB 存取在 apps/api）。

## 3. DataSource 擴充（apps/api）

`DataSource.ratings`：
- `getConfig(gameKey)` / `getPlayerRatings(playerIds, gameKey)` / `upsertPlayerRating(...)`
- `appendHistory(rows)` / `listHistory(playerId, gameKey, limit)`
- `createJob/completeJob/failJob` / `findCompletedJob(tournamentId, gameKey)`
- `leaderboard(gameKey, limit, offset)`

InMemory 與 PG（repos/ratings.ts）各一份實作。

批次計算流程（`apps/api`，經 DataSource）：
1. 檢查權限（`hasTournamentManageAccess`）與賽事狀態；查 `findCompletedJob` → 若存在回 409。
2. 建 job（processing）→ 取 `finished` 對局（排除 void）依 `round_no` 排序。
3. 以記憶體 `ratingMap`（起始為各人 `current_rating` 或 `default`）逐場套 ELO，累積 `RatingChange[]`。
4. 批次 `appendHistory` + `upsertPlayerRating`（更新 peak/lowest/場次）+ `completeJob`。

## 4. API 契約（apps/api → web proxy `/api/otc/...`）

- `POST /api/tournaments/:id/calculate-ratings`（`hasTournamentManageAccess`；`409 ALREADY_RATED`／`409 NOT_CLOSED_OR_IN_PROGRESS` 視需要）→ `{ matchesProcessed, playersAffected }`。
- `GET /api/ratings/:gameKey/leaderboard?limit=&offset=`（公開）→ `PlayerRating[]`（依 current_rating 遞減）。
- `GET /api/players/:id/ratings/:gameKey`（公開，姓名遮罩由前端處理）→ `{ rating, history }`。

## 5. 前端（套 P0 設計系統）

- **作戰台**：[admin/tournaments/[id]] 的「成績與排名」分頁加「計算等級分」按鈕（`ConfirmDialog`；顯示結果/已計算狀態）。
- **公開排行榜**：新增 `apps/web/src/app/ratings/[gameKey]/page.tsx`（列表＋棋種切換；姓名以 `maskName` 遮罩）；首頁/導覽可連入。
- **個人**：[me/record] 加「等級分」卡（當前/峰值/場次；曲線圖延後至 Phase 2 引入 Recharts）。

## 6. 測試

- 單元（packages/rating）：ELO 公式對稱性（A+B 變化相反數同 K 時）、K-factor 分級、期望值邊界。
- 整合：對已完成賽事觸發計算 → 排行榜/個人查詢一致；重算回 409。

## 7. 明確排除（Phase 2+）

更正對局後的全域重算、荷蘭制/Dubov、rating 曲線圖、賽事權重（正式/友誼）、provisional K、跨賽事時間序嚴格排序併發控制。
