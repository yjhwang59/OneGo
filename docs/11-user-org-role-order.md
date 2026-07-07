# 使用者／主辦單位／角色 功能順序建議

## 建議：先完成「主辦單位 + 成員與角色」，再依序做賽事

目前主辦後台（建立賽事、列表）依賴「使用者必須是某個 **Organization** 的成員，且具 **管理權**（owner/admin）」才能看到賽事列表、建立賽事。若沒有先建立主辦單位並把使用者加為成員，`/admin/tournaments` 會是空列表或權限不足。

建議開發順序：

1. **主辦單位與成員管理（含角色）** ← 建議先做  
   - 建立主辦單位（Organization）  
   - 成員列表、新增成員、**角色設定**（owner / admin / staff）  
   - 之後「建立賽事」才有可選的 `organizationId`，且目前使用者才有權限

2. **賽事管理**（你已有 CRUD + 後台列表／詳情）  
   - 建立賽事時選擇主辦單位  
   - 僅具 org 管理權者能建立／編輯／刪除草稿

3. **賽事層級角色**（裁判／工作人員）  
   - Tournament Roles（指派裁判、工作人員、時間衝突檢查）  
   - 可放在「完整賽事流程」穩定後再做

---

## 目前後端已有／缺少

| 功能 | API | 後端狀態 |
|------|-----|----------|
| 建立主辦單位 | `POST /api/organizations` | ✅ 已有（建立者自動為 owner） |
| 列出我的主辦單位 | `GET /api/organizations` | ✅ 已有 |
| 取得單一主辦單位 | `GET /api/organizations/:id` | ✅ 已有 |
| 列出成員 | `GET /api/organizations/:id/members` | ✅ 已有 |
| 新增成員（含角色） | `POST /api/organizations/:id/members` | ✅ 已有（body: `userId`, `role`: owner/admin/staff） |
| **變更成員角色** | `POST /api/organizations/:id/members/:memberId/events/change-role` | ❌ **契約有、實作尚未有** |

權限邏輯（`rbac.ts`）已存在：

- **hasOrgAccess**：只要是該 org 的成員即可（看得到 org、可看賽事等）
- **hasOrgManageAccess**：角色為 **owner 或 admin**（此處 admin 指「主辦管理員」，僅該主辦單位內有效，與系統管理員無關）才能管理成員、建立賽事

因此「角色」已參與權限判斷，只差：  
- 後端實作 **change-role**（更新成員的 `role`）  
- 前端：主辦單位管理 + 成員列表 + 新增成員 + **角色設定／變更** UI

---

## 實作建議（使用者管理 + 角色設定）

1. **後端**  
   - 在 `orgMemberships` 增加「更新角色」方法（例如 `updateRole(membershipId, role)` 或依 `organizationId + userId` 更新）。  
   - 新增 `POST /api/organizations/:id/members/:memberId/events/change-role`，body 例如 `{ "role": "admin" | "staff" }`，僅允許 owner/admin 呼叫。

2. **前端**  
   - 主辦後台側邊選單新增「主辦單位」或「組織管理」。  
   - 頁面：  
     - 我的主辦單位列表（可建立新主辦單位）。  
     - 進入某主辦單位後：成員列表、新增成員（輸入 userId + 選擇 role）、**變更成員角色**（例如下拉選 owner/admin/staff 並呼叫 change-role）。

3. **流程驗證**  
   - 登入 → 建立主辦單位（或選既有）→ 新增自己或他人為成員並設為 owner/admin → 再進「賽事管理」建立賽事，應可正常看到列表並建立。

結論：**建議先完成「主辦單位 + 成員與角色設定」**（含 change-role API 與對應 UI），再依序做賽事管理與賽事層級角色，整體權限與使用流程會較一致。
