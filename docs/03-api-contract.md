# API 契約（草案）

> 原則：API 以「狀態機事件」與「核心資源」表達；棋種差異不滲入核心流程，交由 `packages/rules` 的結果/計分處理。

## 1. 基本慣例
- Base path：`/api`
- 所有資源皆使用 `id`（UUID）
- 時間欄位使用 ISO 8601（UTC）或加上賽事 `timezone` 解讀
- **多主辦單位隔離**：所有「主辦後台」相關資源必須歸屬 `organizationId`，並以 membership 權限控管

## 2. Organizations（主辦單位）
### 2.1 建立/列表/讀取
- `POST /api/organizations`
- `GET /api/organizations`（只回傳使用者所屬的 organizations）
- `GET /api/organizations/:id`

### 2.2 成員與角色（草案）
- `GET /api/organizations/:id/members`
- `POST /api/organizations/:id/members`（邀請/加入，MVP 可先省略邀請流程）
- `POST /api/organizations/:id/members/:memberId/events/change-role`

## 2. Tournaments
### 2.1 建立賽事
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

### 2.2 讀取/列表
- `GET /api/tournaments/:id`
- `GET /api/tournaments?organizationId=&status=&gameKey=`

### 2.3 狀態機事件
- `POST /api/tournaments/:id/events/publish`
- `POST /api/tournaments/:id/events/open-checkin`
- `POST /api/tournaments/:id/events/lock-for-pairing`
- `POST /api/tournaments/:id/events/start`
- `POST /api/tournaments/:id/events/close`
- `POST /api/tournaments/:id/events/cancel`

## 3. Registrations（報名）
- `POST /api/tournaments/:tournamentId/registrations`
- `GET /api/tournaments/:tournamentId/registrations`
- `POST /api/registrations/:id/events/cancel`

## 4. Payments（付款）
> MVP 先做「假金流」：建立付款單 -> 直接標記 succeeded（或模擬 webhook）。

- `POST /api/registrations/:registrationId/payments`（建立付款）
- `POST /api/payments/:id/events/mark-succeeded`（MVP 測試用）
- `POST /api/payments/:id/events/mark-failed`（MVP 測試用）

## 5. Check-in（報到）
- `POST /api/registrations/:registrationId/checkin/events/check-in`
- `POST /api/registrations/:registrationId/checkin/events/withdraw`

## 6. Pairing（編排）
> MVP 可先只支援「第一輪隨機/依種子」的簡易編排，後續再擴 Swiss/循環/淘汰。

- `POST /api/tournaments/:tournamentId/pairings/events/generate-round`
  - Request：`roundNo`
  - Response：建立的 `Match[]`

## 7. Matches（對局/成績上傳）
- `GET /api/tournaments/:tournamentId/matches?roundNo=`
- `POST /api/matches/:id/result`
  - Request：`result`（由 rules 外掛定義的正規化結果）
  - 行為：校驗 result -> 更新 Match 狀態為 finished

## 8. Standings（排名）
- `GET /api/tournaments/:tournamentId/standings`
  - 回傳：依 rules 計分/同分判定的排序結果

## 9. Tournament Roles（賽事層級指派：裁判/工作人員）
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


