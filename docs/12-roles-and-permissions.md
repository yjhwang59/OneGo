# 角色與權限

> 三層角色：平台、主辦單位、賽事。詳盡使用案例與關聯見規劃「平台總管與角色管理規劃」。

## 1. 角色層級

| 層級 | 角色 | 範圍 | 說明 |
|------|------|------|------|
| **平台** | `platform_admin` | 全平台 | **系統總管理員**；可管理全平台所有資料與功能（見第 5 節），並可停權任意帳號（`users.platform_role`） |
| **主辦單位** | `owner` | 單一 Organization | 擁有者：可編輯主辦、刪除主辦、管理成員、轉移 owner |
| **主辦單位** | `admin` | 單一 Organization | 主辦管理員：可管理成員與賽事，不可編輯 slug／刪除主辦 |
| **主辦單位** | `staff` | 單一 Organization | 工作人員：可存取主辦與賽事，不可管理成員 |
| **賽事** | `organizer` / `staff` / `referee` | 單一 Tournament | 僅該賽事；見 API 契約 Tournament Roles |

## 2. 主辦單位內權限矩陣

| 能力 | owner | admin | staff |
|------|-------|-------|-------|
| 檢視主辦與賽事 | ✓ | ✓ | ✓ |
| 建立／編輯／刪除草稿賽事 | ✓ | ✓ | ✗ |
| 列出／新增／移除成員、變更角色 | ✓ | ✓ | ✗ |
| 編輯主辦 slug、刪除主辦 | ✓ | ✗ | ✗ |
| 賽事層級操作（報到、編排、結果） | ✓ | ✓ | ✓ |

## 3. 使用案例編號（對照規劃）

- **PA-1～PA-6**：平台總管（檢視全平台主辦/用戶、停權任意帳號、以總管身分管理任一主辦與賽事）
- **OR-1～OR-8**：主辦 owner/admin（建立主辦、成員 CRUD、變更角色、移除成員、編輯主辦、賽事 CRUD）

## 4. 設定平台總管

**建議（免手動 SQL）**：`npm run grant:admin -- <使用者ID>`（解除加 `--revoke`）。會自動讀 `.env` 連本機/遠端 DB，使用者不存在時自動建立。

亦可於 DB 執行：`UPDATE users SET platform_role = 'platform_admin' WHERE id = '使用者 ID';`（詳見 [docs/06-db-setup.md](06-db-setup.md) 第 4 節）。

## 4.1 成員角色不變量（RBAC 防呆）

- **不可移除最後一位擁有者**：`DELETE .../members/:id` 回 `409 LAST_OWNER`。
- **不可降級最後一位擁有者**：`change-role` 將唯一 owner 改為非 owner 時回 `409 LAST_OWNER`；請先指派另一位 owner（轉移擁有者）。
- 前端 UI 亦會停用對應動作並顯示提示，與後端一致。

## 4.2 一鍵 RBAC 示範資料

`npm run rbac:seed`：於本機 DB 建立一組完整角色階層（平台總管／主辦 owner·admin·staff／賽事 organizer·referee／參賽者）與一場進行中賽事，方便以「模擬登入」逐一驗證各角色權限。需先啟動 API。

## 5. 系統總管理員（platform_admin）能力

`platform_admin` 是**系統總管理員**，可管理全平台所有資料與功能，具體實作於 [apps/api/src/rbac.ts](../apps/api/src/rbac.ts)：

- **穿透所有授權檢查**：`hasOrgAccess`、`hasOrgManageAccess`、`hasTournamentManageAccess`、`hasResultInputAccess` 皆會在開頭以 `isPlatformAdmin` 短路放行。因此總管**不需**是某主辦的成員，即可對任一主辦與賽事執行既有的管理端點（編輯主辦、成員 CRUD、賽事 CRUD、輸入成績等）。
- **平台檢視端點**：`GET /api/platform/organizations`、`/api/platform/users` 等，檢視全平台主辦與用戶。
- **帳號停權**：`PATCH /api/platform/users/:id` 可帶 `status: 'active' | 'suspended'`。被停權（`suspended`）的帳號在 `requireCaller` 會被擋下並回 `403 ACCOUNT_SUSPENDED`，無法呼叫任何需登入的 API。
- **防呆**：總管不可停權自己（回 `409 CANNOT_SUSPEND_SELF`），避免把自己鎖在系統外。

| 能力 | platform_admin |
|------|----------------|
| 檢視全平台主辦與用戶 | ✓ |
| 管理任一主辦（成員、賽事、成績…） | ✓（穿透授權） |
| 停權／解除停權任意帳號 | ✓ |
| 停權自己 | ✗（409） |

> 資料欄位：`users.status`（`active` / `suspended`，預設 `active`），見 [db/schema/otc.sql](../db/schema/otc.sql)。
