# 完整比賽流程 E2E

> 驗證從主辦單位、賽事建立、棋友報名、報到、瑞士制多輪編排、成績上傳，到主分/輔分與最終排名、關閉賽事的整條路徑。

## 目的

- 可重複執行的自動化流程，確保「完成一場瑞士制比賽」的關鍵路徑正常。
- 斷言：standings 筆數、主分（points）、輔分（tiebreaks：wins、head_to_head、opponent_score）、排序、賽事關閉狀態。

## 前置條件

- **API 已啟動**：`npm run dev:api`（預設 port 3001；無 DB 時使用 InMemory）。
- 環境變數（可選）：`OTC_API_BASE`，預設 `http://127.0.0.1:3001`。

## 執行方式

```bash
# 終端 1：啟動 API
npm run dev:api

# 終端 2：執行 E2E
npm run e2e:full-tournament
```

或直接：

```bash
node scripts/e2e-full-tournament.mjs
```

## 流程步驟（對應狀態與 API）

| 步驟 | 說明 | 賽事狀態 |
|------|------|----------|
| 1 | 建立主辦單位 `POST /api/organizations` | — |
| 2 | 建立賽事（草稿）`POST /api/tournaments` | draft |
| 3 | 發布 `POST .../events/publish` | published |
| 4 | 棋友報名 `POST .../registrations`（每位棋友） | published |
| 5 | 開放報到 `POST .../events/open-checkin` | checkin_open |
| 6 | 全部報到 `POST .../registrations/:id/checkin/events/check-in` | checkin_open |
| 7 | 鎖定編排 `POST .../events/lock-for-pairing` | pairing_ready |
| 8 | 每輪：產生編排 `POST .../pairings/events/generate-round`、第 1 輪後 `POST .../events/start`、上傳每場結果 `POST /api/matches/:id/result` | pairing_ready → in_progress |
| 9 | 取得排名 `GET .../standings`（含主分、輔分） | in_progress |
| 10 | 取得公開排名 `GET /api/public/tournaments/:id/standings` | — |
| 11 | 關閉賽事 `POST .../events/close` | closed |

## 斷言說明

- **Standings 筆數**：等於已報到參賽人數（本腳本為 4 人）。
- **主分**：每筆含 `points`（數字）。
- **輔分**：每筆含 `tiebreaks`，且具備 `wins`、`head_to_head`、`opponent_score`。
- **排序**：依 `points` 降序；同分時依 tiebreak 順序（與 `packages/core/src/standings.ts` 的 `DEFAULT_TIEBREAK_ORDER` 一致）。
- **關閉**：最後賽事狀態為 `closed`。

任一步失敗時腳本會印出錯誤並 `process.exit(1)`，方便 CI 與本機除錯。

## 相關文件

- 狀態機：`docs/02-state-machines.md`
- API 契約：`docs/03-api-contract.md`
- 開發手冊測試一節：`docs/10-cursor-dev-manual.md` §6
