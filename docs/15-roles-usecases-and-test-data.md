# 角色說明、使用情境與測試資料

> 本文件說明 OTC 三層角色、各角色 Use Case、擬真測試資料，以及端到端操作流程。  
> 權限矩陣見 [12-roles-and-permissions.md](12-roles-and-permissions.md)；狀態機見 [02-state-machines.md](02-state-machines.md)。

---

## 1. 系統角色總覽

OTC 採 **三層角色模型**：同一帳號可同時具備多層身分（例如既是主辦 admin，也是另一場賽事的裁判）。

```
┌─────────────────────────────────────────────────────────┐
│  平台層  platform_admin（系統總管）                        │
│  範圍：全平台主辦／用戶／停權；穿透所有授權檢查              │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  主辦單位層  OrganizationMembership                       │
│  owner（擁有者）／admin（主辦管理員）／staff（工作人員）     │
│  範圍：單一 Organization 內的成員、賽事、報到、編排、成績   │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  賽事層  TournamentRole                                   │
│  organizer／staff／referee                                │
│  範圍：單一 Tournament（臨時裁判、單場賽務）                │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  參賽者／訪客                                              │
│  無組織／賽事角色；可報名、查對局、看戰績、查公開榜單        │
└─────────────────────────────────────────────────────────┘
```

| 角色 ID | 中文名稱 | 典型人物 | 主要入口 |
|---------|----------|----------|----------|
| `platform_admin` | 平台總管 | OneGo 營運人員 | `/admin/platform` |
| `owner` | 主辦擁有者 | 棋院院長、社團負責人 | `/admin` |
| `admin` | 主辦管理員 | 賽務組長 | `/admin` |
| `staff`（組織） | 主辦工作人員 | 現場志工（跨多場賽） | `/admin` |
| `organizer` | 賽事主辦 | 單場賽事負責人 | 該賽事後台 |
| `referee` | 裁判 | 現場計分裁判 | `/referee` |
| `staff`（賽事） | 賽事工作人員 | 單場臨時志工 | 該賽事後台 |
| （無角色） | 參賽者／棋友 | 選手、家長代報 | `/`、`/me`、`/tournaments` |
| （未登入） | 訪客 | 路人瀏覽 | `/`、`/tournaments`、`/results` |

---

## 2. 各角色使用情境（Use Case）

### 2.1 訪客（未登入）

| ID | Use Case | 說明 | 成功條件 |
|----|----------|------|----------|
| G-1 | 瀏覽開放賽事 | 首頁／賽事列表依棋種、狀態、關鍵字篩選 | 未登入即可看到 `published` 等公開賽事 |
| G-2 | 查看賽事詳情 | 賽程、規則、報名狀態 | 詳情頁可讀；報名按鈕引導登入 |
| G-3 | 查精彩回顧 | 已結束賽事歸檔與公開排名 | `/results` 列出 `closed` 賽事 |
| G-4 | 前往登入／註冊 | Google OAuth 或開發用模擬登入 | 取得 session／`x-user-id` |

### 2.2 參賽者（棋友／家長）

| ID | Use Case | 說明 | 成功條件 |
|----|----------|------|----------|
| P-1 | 註冊／登入 | Google 註冊或模擬登入 | `users` 有帳號；Header 顯示名稱 |
| P-2 | 報名賽事 | 賽事為 `published` 或 `checkin_open` 時報名 | 產生 Registration；「我的報名」可見 |
| P-3 | 取消報名 | 本人取消尚未鎖定之名單 | Registration → `cancelled` |
| P-4 | 查看我的報名 | 報名／繳費／報到狀態摘要 | `/me/registrations` |
| P-5 | 查看我的對局 | 進行中賽事的桌次與對手 | `/me/tournaments/:id/matches` |
| P-6 | 查看戰績履歷 | 跨棋種勝率、近期對局、常見對手 | `/me/record` |
| P-7 | 帳號設定 | 更新顯示名稱、Email | `PATCH /api/me` |
| P-8 | 查公開排名 | 賽事進行中／結束後看 standings | 公開 standings API／頁面 |

### 2.3 主辦擁有者（owner）

| ID | Use Case | 說明 | 成功條件 |
|----|----------|------|----------|
| O-1 | 建立主辦單位 | 首次開通組織 | Organization + 自己為 owner |
| O-2 | 編輯主辦（含 slug） | 改名稱／slug | 僅 owner 可改 slug |
| O-3 | 刪除主辦 | 無關鍵依賴時刪除 | 成功或明確錯誤碼 |
| O-4 | 成員 CRUD | 新增／移除／變更角色 | admin／staff 可加入；不可移除最後 owner |
| O-5 | 轉移擁有者 | 先指派第二位 owner，再降級自己 | 不觸發 `LAST_OWNER` |
| O-6 | 賽事全生命週期 | 建立→發布→報到→編排→成績→關閉 | 見第 4 節流程 |
| O-7 | 指派賽事角色 | 指派 organizer／referee／staff | TournamentRole 建立成功 |

### 2.4 主辦管理員（admin）

| ID | Use Case | 說明 | 成功條件 |
|----|----------|------|----------|
| A-1 | 管理成員 | 新增／變更／移除（非最後 owner） | 與 owner 相同成員能力 |
| A-2 | 建立／編輯賽事 | 草稿建立、設定棋種／輪次 | Tournament `draft` |
| A-3 | 發布與賽務推進 | publish／open-checkin／lock／start／close | 狀態機合法轉換 |
| A-4 | 報到與退賽 | 現場報到、withdrawn | CheckIn 狀態更新 |
| A-5 | 編排與成績 | 產生輪次、上傳結果、看排名 | Matches + Standings |
| A-6 | 不可刪主辦／改 slug | 嘗試刪除或改 slug | `403 FORBIDDEN` |

### 2.5 主辦工作人員（org staff）

| ID | Use Case | 說明 | 成功條件 |
|----|----------|------|----------|
| S-1 | 檢視主辦與賽事 | 進入後台作戰台 | 可見列表，不可建賽／管成員 |
| S-2 | 現場報到／成績 | 協助報到、輸入結果 | 有賽事操作權；無成員管理權 |
| S-3 | 不可建立賽事 | 嘗試 POST tournaments | `403` |

### 2.6 賽事裁判（referee）

| ID | Use Case | 說明 | 成功條件 |
|----|----------|------|----------|
| R-1 | 查看指派賽事 | 「我的裁判賽事」列表 | `/referee` 有該賽 |
| R-2 | 輸入對局成績 | 賽事 `in_progress` 時上傳結果 | Match → `finished` |
| R-3 | 不可管理成員／發布 | 非主辦管理者操作 | `403` |

### 2.7 賽事 organizer／賽事 staff

| ID | Use Case | 說明 | 成功條件 |
|----|----------|------|----------|
| T-1 | 單場賽務管理 | 僅被指派之賽事可管理 | 跨賽事不可見／不可改 |
| T-2 | 賽事 staff 協助 | 報到／成績輔助 | 範圍限該 Tournament |

### 2.8 平台總管（platform_admin）

| ID | Use Case | 說明 | 成功條件 |
|----|----------|------|----------|
| PA-1 | 檢視全平台主辦 | `/admin/platform` 組織列表 | `GET /api/platform/organizations` |
| PA-2 | 檢視／搜尋用戶 | 分頁、關鍵字 | `GET /api/platform/users` |
| PA-3 | 建立／編輯用戶 | 顯示名稱、Email、平台角色 | CRUD 成功 |
| PA-4 | 停權／解除停權 | `status: suspended/active` | 被停權者 API 回 `403 ACCOUNT_SUSPENDED` |
| PA-5 | 不可停權自己 | 防呆 | `409 CANNOT_SUSPEND_SELF` |
| PA-6 | 穿透管理任一主辦／賽事 | 非成員亦可操作 | 授權短路放行 |

---

## 3. 擬真測試資料

### 3.1 如何產生

```bash
# 終端 1
npm run dev:api

# 終端 2（可重複執行，冪等）
npm run seed:realistic
```

腳本：`scripts/seed-realistic-scenarios.mjs`  
環境變數：`OTC_API_BASE`（預設 `http://127.0.0.1:3875`）。  
有 `DATABASE_URL` 時會寫入平台總管；否則請另執行 `npm run grant:admin -- pa-lin`。

### 3.2 主辦單位（模擬台灣真實場景）

| slug | 名稱 | 定位 |
|------|------|------|
| `taipei-gocafe` | 台北 GoCafe | 咖啡廳型圍棋社群，週末段位磨練 |
| `ntu-weiqi` | 台大圍棋社 | 校園社團，學期盃 |
| `tpe-qiyuan` | 台北棋院 | 正式段位賽／月賽主辦 |

### 3.3 帳號一覽（模擬登入用 ID）

#### 平台

| 帳號 ID | 顯示名稱 | 角色 |
|---------|----------|------|
| `pa-lin` | 林營運 | 平台總管 |

#### 台北 GoCafe

| 帳號 ID | 顯示名稱 | 角色 |
|---------|----------|------|
| `gc-chen` | 陳館長 | owner |
| `gc-wang` | 王賽務 | admin |
| `gc-hsu` | 許志工 | staff |
| `gc-ref-liu` | 劉裁判 | 賽事裁判（段位磨練賽） |

#### 台大圍棋社

| 帳號 ID | 顯示名稱 | 角色 |
|---------|----------|------|
| `ntu-wu` | 吳社長 | owner |
| `ntu-chang` | 張副社 | admin |

#### 台北棋院

| 帳號 ID | 顯示名稱 | 角色 |
|---------|----------|------|
| `qy-huang` | 黃院長 | owner |
| `qy-chou` | 周教練 | admin |

#### 棋友（16 位，含真實感姓名）

| 帳號 ID | 顯示名稱 | 備註 |
|---------|----------|------|
| `pl-yang` | 楊子軒 | 常客，報名多場 |
| `pl-lin` | 林品妤 | 青少年組典型 |
| `pl-chen` | 陳柏宇 | — |
| `pl-wu` | 吳宜臻 | — |
| `pl-hsieh` | 謝承恩 | — |
| `pl-tsai` | 蔡宜庭 | — |
| `pl-cheng` | 鄭浩宇 | — |
| `pl-huang` | 黃詩涵 | — |
| `pl-liu` | 劉冠廷 | — |
| `pl-chang` | 張雅筑 | — |
| `pl-hsu` | 許哲維 | — |
| `pl-chou` | 周子晴 | — |
| `pl-kuo` | 郭俊傑 | — |
| `pl-pan` | 潘心怡 | — |
| `pl-fang` | 方立安 | — |
| `pl-shih` | 施雨萱 | — |

### 3.4 賽事與狀態（種子後）

| 賽事名稱 | 主辦 | 棋種 | 賽制 | 輪次 | 目標狀態 | 報名 |
|----------|------|------|------|------|----------|------|
| GoCafe 週末段位磨練賽 | 台北 GoCafe | go | swiss | 4 | `in_progress`（已產第 1 輪） | **段位組 dan 4 人＋級位組 kyu 4 人**，已報到 |
| GoCafe 七月月賽 | 台北 GoCafe | go | swiss | 5 | `published` | 12 人已報名（含 `dan`／`kyu` 組別） |
| GoCafe 週末報到體驗賽 | 台北 GoCafe | go | swiss | 4 | `checkin_open` | **dan 4 人＋kyu 4 人**，部分已報到；供 `gc-hsu` 改組 |
| 台大圍棋社 114 學期盃 | 台大圍棋社 | go | swiss | 5 | `draft` | 無 |
| 台北棋院 夏季段位賽 | 台北棋院 | go | swiss | 6 | `checkin_open` | 8 人已報名、部分報到（`qy-chou` 報到） |
| 台北棋院 西洋棋體驗賽 | 台北棋院 | chess | swiss | 3 | `published` | 4 人已報名 |

> 設計意圖：同一環境可測「草稿／開放報名／報到中／進行中」四種階段，並涵蓋圍棋＋西洋棋。

### 3.5 與既有種子的關係

| 指令 | 用途 |
|------|------|
| `npm run seed:realistic` | **本文件主推**：擬真姓名＋多狀態賽事＋完整角色 |
| `npm run seed:tournament` | 較簡的 3 主辦 × 2 賽事＋`player-01..20` |
| `npm run rbac:seed` | 最小 RBAC 權限驗證（`rbac-*` 帳號） |
| `npm run test:accounts` | 快速帳號組（`otc-admin`／`otc-mgr-*`／`otc-player-*`） |

可並存；建議日常 UX／流程演示用 `seed:realistic`。

---

## 4. 操作流程詳述

### 4.1 開發環境準備

1. 啟動 API：`npm run dev:api`（或 `npm run start` 同時起前後端）
2. 啟動 Web：`npm run dev:web`（若未用 start）
3. 執行種子：`npm run seed:realistic`
4. 瀏覽器開啟前台 → 右上角「模擬」→ 輸入下方帳號 ID（無需密碼）

### 4.2 主辦辦賽完整流程（以 GoCafe 為例）

對應狀態：`draft → published → checkin_open → pairing_ready → in_progress → closed`

| 步驟 | 操作者 | UI／動作 | API（概念） |
|------|--------|----------|-------------|
| 1 | `gc-chen` | 後台建立賽事（棋種 go、瑞士制、輪次） | `POST /api/tournaments` |
| 1b | `gc-wang` | 總覽 → **賽事組別**：新增「段位組 `dan`」「級位組 `kyu`」 | `POST .../categories` |
| 2 | `gc-wang` | 賽事詳情 → 發布 | `.../events/publish` |
| 3 | 棋友 | 前台賽事詳情 → **選擇組別** → 我要報名 | `POST .../registrations`（body 含 `categoryKey`） |
| 4 | `gc-wang` | 開放報到 | `.../events/open-checkin` |
| 5 | `gc-hsu` | 現場報到；必要時**改組** | `check-in`／`change-category` |
| 6 | `gc-wang` | 鎖定編排 | `.../events/lock-for-pairing` |
| 7 | `gc-wang` | 產生第 1 輪、開始賽事 | `generate-round`、`.../events/start` |
| 8 | `gc-ref-liu` | 裁判台輸入每桌結果 | `POST /api/matches/:id/result` |
| 9 | `gc-wang` | 產生下一輪，重複至結束 | `generate-round` + 成績 |
| 10 | `gc-chen` | 查看排名 → 關閉賽事 | `GET .../standings`、`.../events/close` |

種子已將「週末段位磨練賽」推到步驟 7～8 之間（`in_progress`＋第 1 輪），方便直接測裁判計分。

### 4.3 參賽者一日流程

| 步驟 | 帳號建議 | 操作 |
|------|----------|------|
| 1 | `pl-yang` | 模擬登入 → 首頁看「開放報名中」 |
| 2 | | `/tournaments` 篩選圍棋 → 進入「GoCafe 七月月賽」→ 報名 |
| 3 | | `/me` 看待辦（待報到／待繳費提醒） |
| 4 | | `/me/registrations` 確認狀態 |
| 5 | 換 `pl-lin` | 報名「西洋棋體驗賽」→ `/me/record` 看分棋種戰績（賽後才有對局） |

### 4.4 裁判計分流程

| 步驟 | 帳號 | 操作 |
|------|------|------|
| 1 | `gc-ref-liu` | 模擬登入 → Header「計分」→ `/referee` |
| 2 | | 進入「GoCafe 週末段位磨練賽」 |
| 2 | | 進入賽事 → **篩選組別** → 對第 1 輪各桌輸入勝負 |
| 4 | | 確認 Match 狀態為 `finished`；主辦可刷新 standings |

### 4.5 平台總管流程

| 步驟 | 帳號 | 操作 |
|------|------|------|
| 1 | `pa-lin` | 模擬登入 →「平台管理」 |
| 2 | | 全平台用戶：搜尋「楊子軒」、檢視詳情 |
| 3 | | 停權測試帳號（勿停 `pa-lin`）→ 該帳號再呼叫 API 應 `ACCOUNT_SUSPENDED` |
| 4 | | 解除停權；必要時編輯顯示名稱／平台角色 |

### 4.6 權限對照快速驗收

| 模擬帳號 | 應可 | 應不可 |
|----------|------|--------|
| `pa-lin` | 全平台用戶／任一賽事管理 | 停權自己 |
| `gc-chen` | 改 slug、刪主辦、成員、賽務 | — |
| `gc-wang` | 成員、賽務 | 改 slug、刪主辦 |
| `gc-hsu` | 報到／成績 | 建賽、管成員 |
| `gc-ref-liu` | 該賽計分 | 發布賽事、管成員 |
| `pl-yang` | 報名、我的報名／戰績 | 進入主辦後台管理功能 |
| 未登入 | 瀏覽賽事／回顧 | 報名、後台 |

---

## 5. 相關文件與腳本

| 資源 | 路徑 |
|------|------|
| 角色與權限 | `docs/12-roles-and-permissions.md` |
| **測試與驗收** | `docs/16-test-and-acceptance.md` |
| 狀態機 | `docs/02-state-machines.md` |
| 報名種子（簡版） | `docs/07-seed-and-registration-flow.md` |
| 完整比賽 E2E | `docs/13-e2e-full-tournament-flow.md` |
| 擬真種子腳本 | `scripts/seed-realistic-scenarios.mjs` |
| RBAC 最小種子 | `scripts/seed-rbac.mjs` |
