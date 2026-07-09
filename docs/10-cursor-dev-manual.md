# OneGo Cursor 系統開發手冊

> 本手冊專供 Cursor AI 使用。開發時請優先參考此文件，結合 `.cursorrules` 與 `docs/` 下各文件。結構化規則便於快速解析與正確決策。

---

## 1. 專案語境速查

| 項目 | 值 |
|------|-----|
| 專案 | OneGo Tournament Cloud (OTC) — 多棋種賽務平台 |
| 主要語言 | 繁體中文（溝通、註解、文件） |
| 核心實體 | Tournament、Match、Organization |
| 棋種 | go / chess / xiangqi / gomoku（GameKey） |
| 資料儲存 | 目前 InMemory Store；Schema 已備於 db/schema/otc.sql |

---

## 2. 關鍵檔案路徑

### 2.1 必讀文件（依序）

```
docs/00-system-plan.md      # 架構與目標
docs/01-domain-model.md     # 實體與關聯
docs/02-state-machines.md   # 狀態機
docs/03-api-contract.md     # API 契約
.cursorrules                # 全域編碼規範
```

### 2.2 核心程式碼

| 模組 | 路徑 |
|------|------|
| API 入口 | apps/api/src/server.ts |
| 資料來源（PG / InMemory） | apps/api/src/data.ts |
| Repository 層 | apps/api/src/repos/*.ts |
| InMemory Store | apps/api/src/store.ts |
| RBAC | apps/api/src/rbac.ts |
| Rules 選擇器 | apps/api/src/rules.ts |
| 狀態機 guard | packages/core/src/state-machine.ts |
| Standings（含 tiebreak） | packages/core/src/standings.ts |
| 瑞士制配對 | packages/pairing/src/basic-swiss.ts |
| 規則外掛 | packages/rules/src/games/{go,chess,xiangqi,gomoku}/v1.ts |
| DB 連線 | apps/api/src/db.ts |
| Schema | db/schema/otc.sql |

### 2.3 型別定義

- Tournament、Match、Registration 等：`apps/api/src/store.ts`
- RulesPlugin、NormalizedMatchResult：`packages/rules/src/types.ts`
- StandingsRow、FinishedMatch：`packages/core/src/standings.ts`

---

## 3. 硬性規則（MUST / MUST NOT）

### 3.1 領域邊界

- **MUST NOT** 在 Match 或 Tournament 內寫死計分規則；計分一律由 `RulesPlugin.scoreMatch` 處理。
- **MUST NOT** 將 PaymentProvider（如 Stripe、綠界）細節耦合到核心流程；一律透過介面。
- **MUST** 使用 `getRulesPlugin({ gameKey, rulesetVersion })` 取得規則，不可依棋種寫 if-else 分支。

### 3.2 狀態機

- **MUST** 在執行報名、報到、編排、上傳結果前，使用 `canRegister`、`canCheckIn`、`canGeneratePairing`、`canSubmitResult`、`canTransitionTournament` 檢查。
- 狀態機定義：`packages/core/src/state-machine.ts`、`docs/02-state-machines.md`
- **MUST NOT** 跳過狀態檢查直接寫入或更新實體。

### 3.3 API 慣例

- Base path：`/api`
- ID 一律 UUID
- 時間欄位：ISO 8601
- 多主辦：所有主辦相關資源 **MUST** 歸屬 `organizationId`，並以 membership 權限控管
- 需權限端點：**MUST** 要求 `x-user-id`（MVP 模擬登入）

### 3.4 Schema 與文件

- 欄位變更 **MUST** 同步更新 `db/schema/otc.sql` 與 `docs/01-domain-model.md`。
- API 行為變更 **MUST** 更新 `docs/03-api-contract.md`。
- 狀態機變更 **MUST** 更新 `docs/02-state-machines.md`。

### 3.5 前端

- **MUST** 遵循 Mobile First；觸控區域 ≥ 44×44px。
- **MUST** 使用 Tailwind 斷點 `sm:`、`md:`、`lg:`。
- 詳見：`docs/08-ui-rwd-guidelines.md`

---

## 4. 業務邏輯實作指引

### 4.1 新增棋種

1. 在 `packages/rules/src/games/` 下建立 `{gameKey}/v1.ts`。
2. 實作 `RulesPlugin`：`normalizeMatchResult`、`scoreMatch`。
3. 在 rules 的 index 註冊：`packages/rules/src/index.ts`。
4. Schema `game_key` enum 若需擴充，更新 `db/schema/otc.sql`。

### 4.2 新增 API 端點

1. 確認契約已記載於 `docs/03-api-contract.md`。
2. 在 `apps/api/src/server.ts` 加入路由。
3. 需權限：呼叫 `requireCaller`，並用 `hasOrgAccess` / `hasTournamentManageAccess` 檢查。
4. 需狀態檢查：使用 `can*` 系列 guard，不符合則回 `409` 與 `{ code, message }`。

### 4.3 積分／排名邏輯

- 計算入口：`packages/core/src/standings.ts` 的 `computeStandings`。
- 輸入：`participants`、`matches`、`rules`。
- **MUST** 透過 `rules.scoreMatch` 取得單場計分，不可在 core 寫死勝/負/和得分。

### 4.4 配對（Pairing）

- 當前實作：`apps/api/src/server.ts` 內 `generate-round`，簡易依序兩兩配。
- 瑞士制規劃：見 `.cursor/plans/瑞士制與elo系統.plan.md`。
- 參與者來源：已報到（`checkin.status === 'checked_in'`）的 registrations。

---

## 5. 錯誤碼約定

| HTTP | 情境 |
|------|------|
| 401 | 未提供 `x-user-id` 或未驗證 |
| 403 | 無權存取（organization/tournament） |
| 404 | 資源不存在 |
| 409 | 狀態不允許（如 `CANNOT_REGISTER`、`SCHEDULE_CONFLICT`） |
| 400 | 請求格式錯誤、規則驗證失敗（如 `UNSUPPORTED_RULESET`） |

---

## 6. 測試與驗證

- **本機啟動前後端**：`npm run start`（會先停掉 port 3000/3001 再啟動 API 與 Web，詳見 `scripts/start.ps1`；Windows PowerShell）
- 單元測試：`packages/core/src/*.test.ts`、`packages/rules/src/**/*.test.ts`
- MVP 流程腳本：`scripts/mvp-flow.ps1`（需 API 已啟動）
- **完整比賽流程 E2E**：`npm run e2e:full-tournament`（需 API 已啟動）；腳本 `scripts/e2e-full-tournament.mjs`，說明見 `docs/13-e2e-full-tournament-flow.md`
- **用戶管理 E2E**：`npm run e2e:users`（API 需 `OTC_ALLOW_DEV_BOOTSTRAP=1`）；腳本 `scripts/e2e-user-management.mjs`
- **角色／Use Case／擬真測試資料**：`docs/15-roles-usecases-and-test-data.md`；種子 `npm run seed:realistic`
- **測試與驗收**：`docs/16-test-and-acceptance.md`；`npm run e2e:categories`、`npm run e2e:rbac-matrix`
- DB schema 套用：`node scripts/db-apply-schema.mjs`（需 DATABASE_URL）

---

## 7. 開發時決策樹

```
變更類型？
├─ 新增/修改 API
│  └─ 更新 03-api-contract → server.ts → 必要時 rbac/state-machine
├─ 新增/修改實體或欄位
│  └─ 更新 01-domain-model + db/schema/otc.sql + store 型別
├─ 狀態機或業務規則
│  └─ 更新 02-state-machines + state-machine.ts + 相關 guard
├─ 計分/結果格式
│  └─ 更新 packages/rules 對應 gameKey
└─ 前端 UI
   └─ 符合 08-ui-rwd-guidelines + .cursorrules 第 4 節
```

---

## 8. 與 .cursorrules 的關係

- `.cursorrules` 為全域規範，本手冊為 **OTC 專案專用** 補充。
- 兩者衝突時，以 `.cursorrules` 為準；本手冊提供 OTC 的具體路徑、約定與決策指引。
- 開發 OTC 時，**同時** 參照 `.cursorrules` 與本手冊。
