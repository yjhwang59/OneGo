# 種子資料與報名流程

> 說明種子腳本 `scripts/seed-tournament-flow.mjs` 與完整報名流程（主辦建立賽事 → 發布 → 棋友報名）。

## 1. 種子腳本

### 1.1 執行方式

1. 先啟動 API：`npm run dev:api`
2. 執行種子：`npm run seed:tournament`

或直接：

```bash
node scripts/seed-tournament-flow.mjs
```

環境變數：`OTC_API_BASE`（預設 `http://127.0.0.1:3001`）。

### 1.2 種子內容（可重複執行）

| 項目 | 說明 |
|------|------|
| **3 個主辦單位** | GoCafe (gocafe)、圍棋學會 (weiqi)、棋院 (qiyuan) |
| **主辦管理員** | 各主辦由對應管理員建立：`gocafe-admin`、`weiqi-admin`、`qiyuan-admin`（可建立賽事） |
| **每主辦 2 個賽事** | 賽事名稱前加主辦簡稱：GoCafe段位磨練賽、GoCafe月賽；圍棋學會段位賽、圍棋學會月賽；棋院段位賽、棋院月賽 |
| **20 位棋友** | 使用者 ID：`player-01` … `player-20`（會自動 ensureUser） |
| **GoCafe段位磨練賽** | 8 人報名：player-01 … player-08 |
| **GoCafe月賽** | 12 人報名：player-09 … player-20 |

腳本會先查詢是否已存在相同 slug 主辦、相同名稱賽事；已存在則沿用，避免重複建立。報名若已存在會略過（ALREADY_REGISTERED）。

## 2. 報名流程（完整）

### 2.1 主辦端

1. **建立賽事**（草稿）  
   - 主辦管理員登入（例如 `gocafe-admin`）→ 後台「賽事管理」→「建立賽事」  
   - 或 API：`POST /api/tournaments`（需 `organizationId`、name、gameKey、format、roundCount 等）

2. **發布賽事**（開放報名）  
   - 賽事詳情 →「狀態操作」→「發布」  
   - 或 API：`POST /api/tournaments/:id/events/publish`  
   - 狀態由 `draft` → `published`，此時才允許 `POST /api/tournaments/:id/registrations`

3. （選用）**開放報到**  
   - `POST /api/tournaments/:id/events/open-checkin`  
   - 狀態 → `checkin_open`，主辦可執行報到/退賽，報名仍可進行

### 2.2 參賽者端（棋友）

1. **註冊／登入**  
   - 棋友以前台「登入」→「使用 Google 註冊／登入」完成 OAuth；NextAuth 登入後呼叫 OTC `POST /api/users/ensure-from-google`，將用戶寫入 `users` 表，session 帶 OTC `userId`。  
   - 開發時仍可使用前台「模擬」輸入使用者 ID（如 `player-01`），以 header `x-user-id` 模擬登入。

2. **報名**  
   - 賽事為 `published` 或 `checkin_open` 時，使用者以前台「賽事詳情」→「我要報名」或 API `POST /api/tournaments/:tournamentId/registrations`（body: `{ userId }`）  
   - 需登入（Google session 或帶 `x-user-id`）

3. **我的報名**  
   - 前台「我的報名」或 `GET /api/me/registrations` 可查詢當前使用者的報名列表

4. **取消報名**  
   - `POST /api/registrations/:id/events/cancel`（本人或主辦）

### 2.3 狀態與權限

- 報名僅在賽事狀態為 **published** 或 **checkin_open** 時允許（見 `docs/02-state-machines.md`、`packages/core` 的 `canRegister`）。
- 主辦管理員：該主辦的 **owner** 或 **admin** 可建立賽事、發布、管理報名與報到。

## 3. 測試帳號（種子後）

| 角色 | 使用者 ID | 說明 |
|------|-----------|------|
| GoCafe 主辦 | gocafe-admin | 可管理 GoCafe 賽事、報名、報到 |
| 圍棋學會主辦 | weiqi-admin | 可管理圍棋學會賽事 |
| 棋院主辦 | qiyuan-admin | 可管理棋院賽事 |
| 棋友 | player-01 … player-20 | 可於前台報名已發布之賽事、查看我的報名/我的對局 |

- **正式環境**：棋友以「使用 Google 註冊／登入」取得帳號並寫入 `users` 表。
- **開發／種子**：前台「模擬」輸入上述 ID 即可切換角色（header `x-user-id`）。

## 4. 後台棋友管理（平台總管）

- **平台總管**（`users.platform_role = 'platform_admin'`）可於後台「全平台用戶」檢視、搜尋所有棋友（users）。
- **單一用戶詳情**：可編輯顯示名稱、Email、平台角色（一般／平台總管），並以 `PATCH /api/platform/users/:id` 儲存。
