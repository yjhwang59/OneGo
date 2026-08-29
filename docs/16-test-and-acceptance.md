# 測試流程與驗收條件

> 配合 [15-roles-usecases-and-test-data.md](15-roles-usecases-and-test-data.md) 與 [12-roles-and-permissions.md](12-roles-and-permissions.md)。  
> 目標：可重複執行的測試金字塔，作為持續優化基準。

---

## 1. 測試金字塔

```
L1 單元測試（packages）     → npm test
L2 API E2E（scripts）        → e2e:* 指令
L3 種子 + 手動驗收          → seed:realistic + 下方清單
```

| 層級 | 指令 | 何時跑 |
|------|------|--------|
| L1 | `npm test` | packages 變更 |
| L2 | `npm run e2e:full-tournament` | 賽務／API 變更（單組迴歸） |
| L2 | `npm run e2e:categories` | 分組功能變更 |
| L2 | `npm run e2e:rbac-matrix` | RBAC 變更 |
| L2 | `npm run e2e:users` | 用戶管理變更 |
| L3 | `npm run seed:realistic` | 演示／手動驗收前 |

**前置**：`npm run dev:api`（預設 `http://127.0.0.1:3875`）。有 DB 時先 `npm run db:apply`。

---

## 2. 驗收條件（Acceptance Criteria）

### AC-A 分組產品化

1. 主辦可在賽事總覽新增至少兩個組別（如「段位組」「級位組」）。
2. 有定義組別時，未選組報名回 `400 CATEGORY_REQUIRED`；非法 key 回 `400 INVALID_CATEGORY_KEY`。
3. 同輪 `generate-round` 產生的對局，雙方必屬同一 `categoryKey`。
4. 管理端與公開排名依組分區，組內名次從 1 起算。
5. 裁判頁可依組篩選對局。
6. `checkin_open` 可改組；`pairing_ready`／`in_progress` 改組回 `409 CANNOT_CHANGE_CATEGORY`。
7. 無組別定義的舊賽事：報名不需選組（單一預設組）。

### AC-B 操作流程

1. 作戰台總覽顯示組別狀態（已設定 N 組／未分組）。
2. 參賽者報名可選組；「我的報名」可見 `categoryKey`。
3. 本文件與 doc 15 含分組流程說明。

### AC-C 測試可重複

1. `npm run e2e:categories` 失敗時 exit 1。
2. `npm run seed:realistic` 產出雙組 `in_progress` 賽事（段位組＋級位組）。
3. 本節指令可於本機重複執行。

### AC-D 回歸不破壞

1. `e2e:full-tournament`、`e2e:users`、`npm test` 全過。
2. 單組賽事不強制選組。

---

## 3. E2E 腳本說明

### `e2e:full-tournament`

4 人單組瑞士制全流程（見 [13-e2e-full-tournament-flow.md](13-e2e-full-tournament-flow.md)）。

### `e2e:categories`

- 建立主辦與賽事，定義 `dan`／`kyu` 兩組。
- 各 2 人報名並報到，產生第 1 輪。
- 斷言：無跨組對局；各組 standings 各 2 筆且組內 rank 獨立。
- 未選組報名 → 400；鎖定編排後改組 → 409。

### `e2e:rbac-matrix`

- `staff` 建立賽事 → 403。
- 指派 `referee` 上傳成績 → 200；未指派者 → 403。
- 停權帳號 → 403 `ACCOUNT_SUSPENDED`。

### `e2e:users`

平台用戶 CRUD、停權防呆（需 `OTC_ALLOW_DEV_BOOTSTRAP=1`）。

---

## 4. 手動驗收清單（發版／演示前）

- [ ] `gc-wang`：總覽新增組別、發布、看分組報名
- [ ] `pl-yang`：公開頁選組報名
- [ ] `gc-hsu`：GoCafe 週末報到體驗賽 → 報到階段改組
- [ ] `gc-ref-liu`：裁判頁篩組計分
- [ ] 管理端／公開頁排名分組顯示
- [ ] `pa-lin`：平台用戶管理（可選）

---

## 5. 已知決策

- **Elo／戰績履歷**：本階段仍全賽事彙總，不因組別拆開。
- **桌次編號**：該輪跨組連續編號（現場找桌）。
