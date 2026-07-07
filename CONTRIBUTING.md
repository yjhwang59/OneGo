# 貢獻指南（Contributing to OneGo Tournament Cloud）

感謝你參與 OTC 專案。本文件說明分支策略、PR 流程、程式風格與新成員設定，請在提交 PR 前閱讀。

## 分支策略

- **主線**：`main` 為可部署主線，所有變更經由 PR 合併。
- **功能/修復**：自 `main` 拉出分支，命名建議：
  - `feature/簡短描述`（例如 `feature/standings-export`）
  - `fix/簡短描述`（例如 `fix/registration-duplicate`）
- 請勿直接在 `main` 上提交，一律透過 Pull Request。

## Pull Request 流程

1. 從 `main` 拉出你的分支，完成變更。
2. 在提交 PR 前，請在本機執行並通過：
   - `npm run typecheck`
   - `npm run lint`
   - `npm run build`（若有建置腳本）
   - `npm test`（若有測試）
3. 建立 PR，填寫標題與說明；若有關聯的 issue，請在說明中引用。
4. 審核通過後由維護者合併；合併前 CI 會再次執行上述檢查。

## 文件與 Schema 更新

- **每個功能 PR** 都必須同步更新對應文件：
  - API 行為變更 → 更新 `docs/03-api-contract.md`
  - 狀態機或業務規則變更 → 更新 `docs/02-state-machines.md`
  - 領域模型或實體變更 → 更新 `docs/01-domain-model.md` 與（若適用）`db/schema/otc.sql`
- 資料表或欄位變更時，請一併更新 `db/schema/` 下的 schema，並在 PR 說明中註明。

## 架構決策與溝通

- 重要架構決策（例如新增模組、變更 API 契約、持久化策略）建議在 PR 討論或 GitHub Issue 中記錄，方便後續查閱與共識。

---

## 新成員設定（第一次 clone 後）

請依下列步驟完成本機環境，並驗證 API 與 MVP 流程可正常運行。

### 1. 安裝依賴

在 repo 根目錄執行：

```bash
npm install
```

### 2. 資料庫（選用）

未設定 `DATABASE_URL` 時 API 使用 **InMemory Store**，重啟即清空，無需 DB 即可跑完整 MVP。  
若需 **PostgreSQL 持久化**，請依 [docs/06-db-setup.md](docs/06-db-setup.md) 選擇方案 A（Docker）、B（本機 Postgres）或 C（雲端），設定 `DATABASE_URL` 後執行 `npm run db:apply` 套用 schema。

### 3. 環境變數（選用）

- 若使用 Postgres，請複製 `config/env.example` 為 `.env`（或在本機 shell 設定），並設定 `DATABASE_URL`。
- API 預設：`PORT=3875`、`HOST=::`；未設定 `DATABASE_URL` 時，API 仍可運行，僅 health 回傳 `db: { enabled: false }`。

### 4. 啟動 API

```bash
npm run dev:api
```

預設：<http://localhost:3875>。可訪問 `GET /api/health` 與 `GET /api` 確認。

### 5. 驗證 MVP 流程

在 API 已啟動的前提下，於 **PowerShell** 執行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/mvp-flow.ps1
```

腳本會依序：建立主辦單位與賽事、發布、報名、報到、編排、上傳結果、查排名等，全部通過即代表 MVP 流程正常。

### 6. 前端（選用）

```bash
npm run dev:web
```

預設：<http://localhost:3874>（Next.js）。

---

## 參考文件

- **開發手冊（人類版）**：[docs/09-system-dev-manual.md](docs/09-system-dev-manual.md) — 整合式開發指南
- **Cursor 開發手冊**：[docs/10-cursor-dev-manual.md](docs/10-cursor-dev-manual.md) — 供 AI 輔助開發用
- 系統規劃與領域模型：[docs/00-system-plan.md](docs/00-system-plan.md)、[docs/01-domain-model.md](docs/01-domain-model.md)
- 狀態機：[docs/02-state-machines.md](docs/02-state-machines.md)
- API 契約：[docs/03-api-contract.md](docs/03-api-contract.md)
- API 快速操作：[docs/05-api-quickstart.md](docs/05-api-quickstart.md)
- DB 設定：[docs/06-db-setup.md](docs/06-db-setup.md)
