# OneGo 系統開發手冊（人類版）

> 本手冊整合專案文件，供開發者快速上手、理解架構與遵循規範。適合新成員或跨模組開發時查閱。

---

## 一、快速開始

### 1.1 首次設定（約 5 分鐘）

1. **安裝依賴**
   ```bash
   npm install
   ```

2. **啟動 API**
   ```bash
   npm run dev:api
   ```
   - 預設：<http://localhost:3001>
   - 健康檢查：`GET /api/health`
   - 未設定 `DATABASE_URL` 時使用 InMemory Store（重啟清空）；有設定則使用本機/遠端 PostgreSQL

3. **驗證 MVP 流程**（PowerShell）
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/mvp-flow.ps1
   ```
   - 會依序執行：建立主辦單位 → 賽事 → 報名 → 報到 → 編排 → 上傳結果 → 查排名

4. **前端**（選用）
   ```bash
   npm run dev:web
   ```
   - 預設：<http://localhost:3000>
   - **可操作報名流程**：首頁 →「瀏覽賽事並報名」→ 右上角「模擬登入」輸入使用者 ID（如 `user-001`）→ 進入賽事詳情 →「我要報名」→「我的報名」可查列表與取消。需 API 已啟動且賽事狀態為 `published` 或 `checkin_open` 方可報名。

### 1.2 資料庫

- 設定 `DATABASE_URL`（或 `DATABASE_URL_LOCAL` / `DB_TARGET=local`）後，API 會使用 PostgreSQL；未設定則 fallback 至 InMemory。
- 套用 schema：`npm run db:apply`（需已設定 `DATABASE_URL`）。詳見 [06-db-setup.md](06-db-setup.md)。
- Schema 檔：`db/schema/otc.sql`

### 1.3 模擬登入

- 所有需權限的 API 使用 header `x-user-id` 模擬使用者。
- 範例：`x-user-id: alice`（參賽者）、`x-user-id: org-admin`（主辦）

---

## 二、架構總覽

### 2.1 Repo 結構

```
OneGo/
├── apps/
│   ├── api/        # Fastify API
│   └── web/        # Next.js 前端
├── packages/
│   ├── core/       # 核心邏輯（狀態機、standings 含 tiebreak、state guard）
│   ├── pairing/    # 瑞士制配對（基礎同分組、避免重賽、bye）
│   └── rules/      # 棋種規則外掛（go/chess/xiangqi/gomoku）
├── db/schema/      # PostgreSQL schema
├── docs/           # 系統文件
├── scripts/       # 腳本（DB、MVP 流程測試）
└── config/         # 環境設定範例
```

### 2.2 核心概念

| 概念 | 說明 |
|------|------|
| **Tournament** | 賽事本體，含狀態機、棋種、賽制 |
| **Match** | 單場對局，不負責積分計算 |
| **Organization** | 主辦單位，多租戶邊界 |
| **Registration / CheckIn** | 報名與報到，依狀態機約束操作 |
| **Rules Plugin** | 依 `gameKey` + `rulesetVersion` 處理計分與結果正規化 |

### 2.3 必讀文件

| 文件 | 用途 |
|------|------|
| [00-system-plan.md](00-system-plan.md) | 產品定位、架構決策 |
| [01-domain-model.md](01-domain-model.md) | 實體與關聯 |
| [02-state-machines.md](02-state-machines.md) | 狀態機與事件 |
| [03-api-contract.md](03-api-contract.md) | API 契約 |
| [05-api-quickstart.md](05-api-quickstart.md) | curl 快速操作 |
| [06-db-setup.md](06-db-setup.md) | 資料庫設定 |
| [08-ui-rwd-guidelines.md](08-ui-rwd-guidelines.md) | RWD 設計與驗收 |

---

## 三、開發流程與規範

### 3.1 分支與 PR

- 主線：`main`，經 PR 合併。
- 分支命名：`feature/簡短描述`、`fix/簡短描述`。
- 詳見 [CONTRIBUTING.md](../CONTRIBUTING.md)。

### 3.2 功能開發時必須同步更新

| 變更類型 | 需更新文件 |
|----------|------------|
| API 行為 | `docs/03-api-contract.md` |
| 狀態機／業務規則 | `docs/02-state-machines.md` |
| 領域模型／實體 | `docs/01-domain-model.md`、`db/schema/` |
| 資料表欄位 | `db/schema/otc.sql` |

### 3.3 常用指令

```bash
npm run typecheck    # 型別檢查
npm run lint         # Lint
npm run build        # 建置（各 workspace）
npm test             # 執行測試
npm run db:apply     # 套用 schema（需 DATABASE_URL）
```

### 3.4 架構原則（來自 .cursorrules）

- **API First**：先定資料模型與 API 契約，再寫程式。
- **Pure Functions**：積分、編排、結果正規化優先寫成可單元測試的純函式。
- **Rule Plugins**：棋種差異透過 `packages/rules` 外掛處理，不寫死。
- **Decoupling**：PaymentProvider 抽象，不把金流細節耦合到核心。

---

## 四、賽事流程（狀態機）

```
draft → publish → published
  → openCheckIn → checkin_open
  → lockForPairing → pairing_ready
  → start → in_progress
  → close → closed
```

- **報名**：僅 `published` 或 `checkin_open` 可報名。
- **報到**：僅 `checkin_open` 可變更報到。
- **編排**：僅 `pairing_ready` 或 `in_progress` 可產生對局。
- **上傳結果**：僅 `in_progress` 可提交結果。

---

## 五、前端開發

### 5.1 技術 stack

- Next.js + React + TypeScript + Tailwind CSS
- 主色調：Indigo (#4F46E5)，用於主要行動

### 5.2 RWD 要求

- **Mobile First**：優先用手機單手操作設計。
- **觸控區域**：至少 44×44px。
- **斷點**：`sm`(640px)、`md`(768px)、`lg`(1024px)。
- 完整驗收項目見 [08-ui-rwd-guidelines.md](08-ui-rwd-guidelines.md)。

### 5.3 UI 開發建議

- 使用 Functional Components。
- Mock Data 置於檔案頂部或獨立檔案，方便替換 API。
- 依角色（主辦／參賽者）切換 UI 與權限。

---

## 六、多主辦單位（多租戶）

- 每個 Tournament 隸屬於一個 Organization。
- 權限：`OrganizationMembership`（Owner/Admin/Staff）決定組織層存取。
- `TournamentRole`（organizer/staff/referee）可把權限限定在單一賽事。
- 裁判指派時，若賽事時間重疊，API 回傳 `409 SCHEDULE_CONFLICT`。

---

## 七、競品與分期

- 競品對照與 MVP/Next 分期見 [04-competitive-notes-playgo.md](04-competitive-notes-playgo.md)。
- 瑞士制與 ELO 規劃見 `.cursor/plans/瑞士制與elo系統.plan.md`。

---

## 八、疑難排解

| 情況 | 處理 |
|------|------|
| API 重啟後資料消失 | 未設定 `DATABASE_URL` 時為預期（InMemory）。設定並套用 schema 後即持久化。 |
| mvp-flow.ps1 失敗 | 確認 API 已啟動，且 `x-user-id` 邏輯正確。 |
| Docker 無法啟動（Windows ARM） | 見 [06-db-setup.md](06-db-setup.md) 方案 B/C（本機或雲端 Postgres）。 |
| 型別錯誤 | 執行 `npm run typecheck`，各 workspace 需各自 pass。 |

---

*本手冊最後更新與 docs 同步；若有衝突以各單獨文件為準。*
