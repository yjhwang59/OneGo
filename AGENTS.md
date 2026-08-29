# AGENTS.md

OneGo Tournament Cloud (OTC) — 統一棋賽雲端平台（Go / Chess / Xiangqi / Gomoku）。
npm workspaces monorepo：`apps/api`（Fastify）、`apps/web`（Next.js）、`packages/{core,rules,pairing}`（共用函式庫）。

專案背景與開發規範請見 `.cursorrules`、`docs/`（特別是 `docs/09-system-dev-manual.md`、`docs/10-cursor-dev-manual.md`）與 `CONTRIBUTING.md`。標準指令（build / lint / typecheck / test / dev）定義在根 `package.json` scripts，請以該檔為準。

## Cursor Cloud specific instructions

環境啟動時 update script 只會執行 `npm install`（安裝所有 workspaces 相依）。以下為在此環境開發/測試時的非顯而易見注意事項：

- **服務與埠號**：API（`apps/api`，Fastify）跑在 **3875**；Web（`apps/web`，Next.js）跑在 **3874**。啟動：`npm run dev:api` 與 `npm run dev:web`（皆於 repo 根目錄）。Web 透過 `/api/otc/*` route handler 代理到 API（預設 `http://127.0.0.1:3875`）。
- **埠號文件過時**：`docs/05-api-quickstart.md` 與 `.claude/settings.json` 內寫的 `3001` / `3000` 已過時，實際程式碼（`server.ts`、`config/env.example`）與 Web 預設皆為 **3875 / 3874**，以此為準。
- **資料庫為選用（預設 InMemory）**：未設定 `DATABASE_URL*` 時，API 使用 InMemory Store（重啟即清空），`GET /api/health` 會回 `db.enabled=false`。此模式即可跑完整 MVP 流程，**無需**啟動 Postgres。若要持久化，`docker compose up -d postgres` 後設定 `.env` 的 `DATABASE_URL_LOCAL` 並執行 `npm run db:apply`。
- **`dev:api` 會先建置套件**：`apps/api` 的 `predev` hook 會先 build `packages/{rules,core,pairing}` 到各自 `dist/`。若你改了這些 package 的原始碼，tsx watch **不會**自動重編套件——需重跑 `npm run dev:api`（或手動 `npm -w @otc/<pkg> run build`）才會生效。
- **模擬登入（開發用）**：未設定 Google OAuth（`AUTH_GOOGLE_ID/SECRET`）時，用前端 header 右上「模擬」按鈕輸入任意 user id（例如 `player-01`、`org-admin`）即可登入；此 id 存於 localStorage 並以 `x-user-id` header 送往 API。curl 測試 API 時直接帶 `-H "x-user-id: <id>"`。
- **Lint 現況**：`npm run lint` 目前在 `apps/web` 有既有錯誤（React hooks 規則，如 `set-state-in-effect`），與環境設定無關；`packages/*` 的 lint 多為 no-op（`echo ok`）。`npm run typecheck`、`npm test`（vitest，位於 `packages/*`）目前皆通過。
- **PowerShell 腳本為 Windows 專用**：`scripts/*.ps1` 與 `npm start`（`start.ps1`）在 Linux 無法執行；請改用 `npm run dev:api` / `dev:web` 與 `docker compose`。跨平台的 `.mjs` 腳本（`db:apply`、`seed:tournament`、`e2e:full-tournament` 等）可用 `node` 執行。
