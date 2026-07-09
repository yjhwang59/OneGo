# API 契約（草案）

> 原則：API 以「狀態機事件」與「核心資源」表達；棋種差異不滲入核心流程，交由 `packages/rules` 的結果/計分處理。

## 1. 基本慣例
- Base path：`/api`
- 所有資源皆使用 `id`（UUID）
- 時間欄位使用 ISO 8601（UTC）或加上賽事 `timezone` 解讀
- **多主辦單位隔離**：所有「主辦後台」相關資源必須歸屬 `organizationId`，並以 membership 權限控管

## 2. Organizations（主辦單位）
> 角色 owner/admin/staff 皆為**該主辦單位內**的權限（admin = 主辦管理員），與平台或系統管理員無關。

### 2.1 建立/列表/讀取
- `POST /api/organizations`
- `GET /api/organizations`（只回傳使用者所屬的 organizations）
- `GET /api/organizations/:id`

### 2.2 更新主辦單位
- `PATCH /api/organizations/:id`
  - Request（皆可選）：`name`、`slug`
  - 僅 owner/admin 可呼叫；**編輯 slug 僅 owner** 可呼叫，否則 403
  - 回傳更新後的 Organization

### 2.3 成員與角色
- `GET /api/organizations/:id/members`
- `POST /api/organizations/:id/members`（body: `userId`, `role`：owner/admin/staff）
- `POST /api/organizations/:id/members/:memberId/events/change-role`（body: `role`，僅 owner/admin 可呼叫）
- `DELETE /api/organizations/:id/members/:memberId`
  - 僅 owner/admin 可呼叫；若該成員為最後一位 owner，回傳 `409 LAST_OWNER`
  - 成功回傳 204

## 3. Tournaments
### 3.1 建立賽事
- `POST /api/tournaments`

Request（概念）：
- `organizationId`
- `name`
- `gameKey`
- `rulesetVersion`
- `timezone`
- `format`
- `roundCount`
- `startsAt`（可選）
- `endsAt`（可選）

### 3.2 讀取/列表
- `GET /api/tournaments/:id`
- `GET /api/tournaments?organizationId=&status=&gameKey=`

#### 3.2.1 公開（訪客可讀，無需登入）

- `GET /api/public/tournaments?status=&gameKey=&keyword=`
  - 僅回傳 `published / checkin_open / pairing_ready / in_progress / closed` 的賽事
  - `keyword`：對賽事名稱做不分大小寫的子字串比對（PG：`ILIKE`）
  - 供前端「公開探索」頁篩選（見 [docs/14](14-ux-role-optimization-plan.md) P1）；日期區間目前在前端依 `startsAt` 過濾
- `GET /api/public/tournaments/:id`：半公開單筆（不含 `organizationId`）

### 3.3 更新賽事（僅 draft）
- `PATCH /api/tournaments/:id`

Request（皆可選）：
- `name`、`gameKey`、`rulesetVersion`、`timezone`、`format`、`roundCount`、`startsAt`、`endsAt`
- 非 draft 時回傳 `409 INVALID_STATE`（僅草稿可編輯）

### 3.4 刪除賽事（僅 draft）
- `DELETE /api/tournaments/:id`
- 僅 `status === 'draft'` 可刪除；非 draft 時回傳 `409 INVALID_STATE`

### 3.5 狀態機事件
- `POST /api/tournaments/:id/events/publish`
- `POST /api/tournaments/:id/events/open-checkin`
- `POST /api/tournaments/:id/events/lock-for-pairing`
- `POST /api/tournaments/:id/events/start`
- `POST /api/tournaments/:id/events/close`
- `POST /api/tournaments/:id/events/cancel`

## 4. Registrations（報名）
- `POST /api/tournaments/:tournamentId/registrations`（body：`userId`、可選 `categoryKey`；**若賽事已定義組別則 `categoryKey` 必填**）
- `GET /api/tournaments/:tournamentId/registrations`
- `POST /api/registrations/:id/events/cancel`
- `POST /api/registrations/:id/events/change-category`（body：`categoryKey`；僅 `published`／`checkin_open`）
- `GET /api/me/registrations`：目前使用者的所有報名

### 4.0 Tournament Categories（賽事組別）
- `GET /api/tournaments/:tournamentId/categories`（主辦成員）
- `GET /api/public/tournaments/:tournamentId/categories`（公開，已發布賽事）
- `POST /api/tournaments/:tournamentId/categories`（body：`key`、`displayName`、`sortOrder?`、`capacity?`）
- `PATCH /api/tournaments/:tournamentId/categories/:categoryId`
- `DELETE /api/tournaments/:tournamentId/categories/:categoryId`（有報名則 `409 CATEGORY_HAS_REGISTRATIONS`）

錯誤碼：`CATEGORY_REQUIRED`、`INVALID_CATEGORY_KEY`、`CATEGORY_FULL`、`CANNOT_CHANGE_CATEGORY`

編排與排名：各 `categoryKey` **組內獨立**瑞士制配對與名次；桌次該輪跨組連號。

公開排名 `GET /api/public/tournaments/:id/standings`：與管理端相同之分組 standings（含 `categoryKey`）；`?categoryKey=` 可篩單組。

### 4.1 個人戰績彙整（參賽者個人中心，P2）

- `GET /api/me/record`（需登入）：跨賽事、跨棋種的純函式彙整
  - Response：
    - `overall`：`{ games, wins, draws, losses, winRate }`（`winRate = wins/games`，`void` 對局不計）
    - `byGame[]`：同上並帶 `gameKey`，依場次遞減
    - `recentMatches[]`：最近 10 場已完成對局（`tournamentName / gameKey / roundNo / opponentId / outcome / finishedAt`）
    - `topOpponents[]`：最常對戰對手（前 5）
    - `reminders`：`{ awaitingPayment, awaitingCheckin }`（待繳費／待報到筆數）
    - `totals`：`{ registrations, tournaments }`

## 5. Payments（付款）
> MVP 先做「假金流」：建立付款單 -> 直接標記 succeeded（或模擬 webhook）。

- `POST /api/registrations/:registrationId/payments`（建立付款）
- `POST /api/payments/:id/events/mark-succeeded`（MVP 測試用）
- `POST /api/payments/:id/events/mark-failed`（MVP 測試用）

## 6. Check-in（報到）
- `POST /api/registrations/:registrationId/checkin/events/check-in`
- `POST /api/registrations/:registrationId/checkin/events/withdraw`
- `GET /api/tournaments/:tournamentId/checkins`：報到看板；回傳 `{ registrationId, status, checkedInAt? }[]`
  - 讀取權限 `hasOrgAccess`（org 成員含 staff 皆可讀）；供主辦作戰台顯示報到狀態與批次報到（P3）
- 報到／退賽寫入權限：`hasOrgAccess`（org 成員含 **staff** 可操作，與改組一致）

## 7. Pairing（編排）
> 已實作基礎瑞士制：依當前積分分組、同分組內配對、避免重複對局、奇數時 bye；必要時允許重賽以產出該輪。

- `POST /api/tournaments/:tournamentId/pairings/events/generate-round`
  - Request：`roundNo`
  - Response：建立的 `Match[]`
  - 若有輪空選手，Response Header：`X-Pairing-Byes`（逗號分隔 playerId）

## 8. Matches（對局/成績上傳）
- `GET /api/tournaments/:tournamentId/matches?roundNo=`
- `POST /api/matches/:id/result`
  - Request：`result`（由 rules 外掛定義的正規化結果）
  - 行為：校驗 result -> 更新 Match 狀態為 finished

## 8.1 ELO 等級分（Phase 1；詳見 [docs/08](08-rating-system.md)）

- `POST /api/tournaments/:id/calculate-ratings`（`hasTournamentManageAccess`）
  - 依本賽事已完成對局逐場套 ELO 並更新棋手等級分；回 `{ matchesProcessed, playersAffected }`
  - 冪等：同賽事已計算過回 `409 ALREADY_RATED`（MVP 不支援重算）；`void` 對局不計
- `GET /api/ratings/:gameKey/leaderboard?limit=&offset=`（公開）：依 `current_rating` 遞減
- `GET /api/players/:id/ratings/:gameKey`（公開）：`{ rating, history[] }`（單棋種當前分與變化紀錄）

## 9. Standings（排名）
- `GET /api/tournaments/:tournamentId/standings`
  - 回傳：依 rules 計分，同分時依 tiebreak 順序（預設：勝場數、直接勝負、對手分 Buchholz）；每筆含 `tiebreaks?: { wins, head_to_head, opponent_score }`

## 10. Tournament Roles（賽事層級指派：裁判/工作人員）
> 需求：同一位裁判可被指派到多個賽事，**只要賽事時間區間不重疊**。MVP 先由 API 在指派時檢查。

- `GET /api/tournaments/:tournamentId/roles`
- `POST /api/tournaments/:tournamentId/roles`
  - Request：`userId`, `role`（例如 `referee` / `staff`）
  - 行為：
    - 檢查呼叫者對該 tournament 的管理權（organization 或 tournament 層級）
    - 若 `role` 為 `referee/staff` 且 tournament 有 `startsAt/endsAt`：
      - 查詢該 `userId` 既有被指派的其他 tournaments 時間區間是否重疊
      - 若重疊：回 `409 CONFLICT`（建議錯誤碼：`SCHEDULE_CONFLICT`）
- `DELETE /api/tournaments/:tournamentId/roles/:roleId`

## 11. Users（棋友／帳號）
> 棋友可經 Google OAuth 註冊；以下端點供受信任的 Next.js 後端在登入 callback 後呼叫。

- `POST /api/users/ensure-from-google`
  - **用途**：依 Google 帳號建立或更新用戶，回傳 OTC 的 `userId`。僅由 Next.js 等受信任服務呼叫；若設定 `OTC_SERVER_SECRET`，Request Header 須帶 `x-otc-server-secret`。
  - Request body：`{ sub: string, email?: string, name?: string, picture?: string }`
  - Response：`{ userId: string, displayName: string, email?: string }`
  - 邏輯：先以 `google_sub` 查詢，無則以 `email` 查詢；存在則更新 display_name/avatar_url，不存在則 INSERT。

- `PATCH /api/me`（本人自助更新）
  - Request body（皆可選）：`{ displayName?: string, email?: string | null }`
  - Response：與 `GET /api/me` 相同結構（含 `googleLinked` 等）
  - `409 EMAIL_TAKEN`：Email 已被其他帳號使用
  - 不可變更 `platformRole`、`status`

- `GET /api/me` 擴充欄位：`email`、`avatarUrl`、`status`、`createdAt`、`googleLinked`（是否已綁定 Google，不洩漏 `google_sub`）

## 12. Platform（平台總管／系統總管理員）
> 以下路徑僅 **platform_admin**（系統總管理員）可呼叫；權限由 `users.platform_role` 判定，與主辦內 owner/admin 無關。
> 註：platform_admin 亦**穿透**所有主辦／賽事層級授權檢查，故可直接以總管身分呼叫既有的主辦與賽事管理端點（見 [docs/12](12-roles-and-permissions.md) 第 5 節）。

- `GET /api/me`
  - 回傳當前使用者：`{ userId, displayName?, platformRole?, orgRoles: string[], isReferee: boolean }`
  - `orgRoles`：使用者在各主辦單位的成員角色（`owner`/`admin`/`staff`）去重清單；`isReferee`：是否在任一賽事被指派為裁判
  - 供前端「角色感知導覽」判斷是否顯示 主辦後台／計分／平台管理 入口（見 [docs/14](14-ux-role-optimization-plan.md) P0）
- `GET /api/platform/stats`：平台總覽量化（P4）
  - Response：`{ counts: { organizations, users, tournaments, inProgressTournaments }, recentUsers: [{ id, displayName, email, status, createdAt }] }`
- `GET /api/platform/organizations`：全平台主辦單位列表
- `GET /api/platform/organizations/:id`：單一主辦單位詳情
- `GET /api/platform/users?limit=&offset=&q=`：全平台用戶列表（分頁）
  - Response：`{ items: User[], total: number, limit: number, offset: number }`
  - 每筆 User 含 `googleLinked`（是否已綁定 Google）、`avatarUrl` 等；不洩漏 `google_sub`
- `POST /api/platform/users`：建立用戶
  - Body：`{ id: string, displayName?: string, email?: string | null, platformRole?: 'platform_admin' | null }`
  - `409 ALREADY_EXISTS`（id 重複）、`409 EMAIL_TAKEN`（email 已被使用）
- `GET /api/platform/users/:id`：單一用戶詳情
- `DELETE /api/platform/users/:id`：刪除用戶
  - `409 CANNOT_DELETE_SELF`（不可刪除自己）
  - `409 USER_HAS_RELATIONS`（仍有主辦成員／賽事角色／報名，請先移除關聯或改用停權）
- `PATCH /api/platform/users/:id`：更新用戶（棋友管理／停權）
  - Request body（皆可選）：`{ displayName?: string, email?: string | null, platformRole?: 'platform_admin' | null, status?: 'active' | 'suspended' }`
  - Response：更新後的 User
  - 僅 platform_admin 可呼叫；404 若用戶不存在
  - **停權**：`status: 'suspended'` 之後，該帳號呼叫任何需登入的 API 會被擋下並回 `403 ACCOUNT_SUSPENDED`
  - **防呆**：不可停權自己，否則回 `409 CANNOT_SUSPEND_SELF`

