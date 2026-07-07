# OneGo Tournament Cloud（OTC）

**OneGo Tournament Cloud: Unified Board Game Event Platform**

## 一句話簡介
OneGo棋賽雲，是專為圍棋、西洋棋、象棋與五子棋打造的一站式雲端賽務平台，從線上報名、繳費到對局編排與成績管理，全程自動化與數位化。

## 首頁簡介文案（草案）
OneGo棋賽雲整合「線上報名與繳費」「現場報到與對局編排」「即時成績與歷史戰績管理」，讓主辦單位大幅減少紙本與人工統計負擔。  
參賽者與家長可以用同一個帳號，查看多棋種、多賽事的報名紀錄、對局資訊與累積成績，建立專屬的棋力成長履歷。

## Repo 結構（規劃中）
- `docs/`：系統規劃、資料模型、API 契約、狀態機（每個功能 PR 都要更新）
- `db/schema/`：資料表草案（先從核心 Tournament/Match 開始）
- `apps/`：可執行應用（API、Web）
- `packages/`：共用套件（core、rules、pairing）

## 資料儲存說明（MVP 階段）

**API 依 `DATABASE_URL` 自動切換**：
- **有設定**（本機或遠端 PostgreSQL）：透過 Repository 層持久化，資料重啟後保留。需先套用 `db/schema/otc.sql`（見 `docs/06-db-setup.md`）。
- **未設定**：使用 InMemory Store，重啟即清空，適合本機開發與流程驗證。

## 如何開始（目前）
1. 先閱讀 `docs/00-system-plan.md`
2. 再看 `docs/01-domain-model.md` 與 `db/schema/otc.sql`
3. 依 `docs/03-api-contract.md` 開始做 MVP API
4. 競品/分期參考：`docs/04-competitive-notes-playgo.md`
5. DB（Postgres / Docker）：`docs/06-db-setup.md`
6. **協作與首次設定**：請見 [CONTRIBUTING.md](CONTRIBUTING.md) 的「新成員設定」與 PR 流程。

> 補充：若你是 Windows on ARM（Snapdragon），Docker Desktop 可能因 WSL mount vhd 限制而無法啟動；請直接參考 `docs/06-db-setup.md` 的方案 B/C。
