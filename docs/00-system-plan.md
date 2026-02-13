# 系統規劃書（草案）— OneGo Tournament Cloud（OTC）

## 1. 產品定位與目標
- **產品定位**：多棋種賽務平台（圍棋 / 西洋棋 / 象棋 / 五子棋）
- **核心原則**：後端以 `Tournament` 與 `Match` 為核心資料模型；棋種差異以 `GameKey` + `rulesetVersion` + 規則外掛（`packages/rules`）承接
- **目標（MVP）**：
  - 線上報名、（假）線上繳費、現場報到/調整、對局編排、成績上傳、排名查詢
  - 同一帳號可查看多賽事、多棋種歷程（報名、對局、累積成績）

## 2. 角色與使用情境
- **主辦單位（Organization）**：一個可管理多個賽事的組織（例如棋院、學校、協會、社團）
- **主辦單位（Organizer）**：建立賽事、設定規則/組別、管理報名與付款、現場報到、編排、上傳成績、匯出報表
- **裁判/工作人員（Staff）**：協助報到/調整、錄入結果、處理異常
- **參賽者/家長（Player/Guardian）**：報名/繳費、查看對局與成績、歷史戰績

## 3. 架構切分（責任邊界）
### 3.1 核心領域（不得被其他表/流程侵入）
- **Tournament**：賽事基本資料與賽務階段（狀態機）
- **Match**：對局資料（輪次、桌次、雙方、結果、狀態）

### 3.2 周邊領域（只引用核心，不改寫核心責任）
- **Registration**：報名資料（誰報名哪個賽事/組別）
- **Payment**：付款紀錄（以 `PaymentProvider` 介面抽象）
- **Check-in**：報到/現場狀態（出席、退賽、替補、調整）
- **Pairing**：編排策略與產物（Swiss/循環/淘汰）；MVP 先做最簡
- **Standings**：積分/排名計算（優先做可測試純函式）

## 4. 多棋種支援策略（規則外掛）
- 以 `GameKey`（go/chess/xiangqi/gomoku）標識棋種
- 以 `rulesetVersion` 管理規則版本（可逐步演進而不破壞既有資料）
- 以 `packages/rules` 提供：
  - **結果正規化**（例如：勝/負/和、棄權、超時等）
  - **計分與排名 tiebreak**（依棋種/賽制決定）
  - **合法結果校驗**（避免前端/人員輸入亂碼）

## 5. 技術選型（建議，仍可調整）
- **語言**：TypeScript（前後端一致）
- **資料庫**：PostgreSQL
- **API 風格**：REST（先求清晰狀態機），後續可加 Webhook/Realtime
- **Monorepo**：npm workspaces（已建立）

> 注意：本草案先把「契約與責任」定清楚；框架（Nest/Fastify/Next）可稍後再落地。

## 7. 多主辦單位（Multi-Organization / Multi-tenant）原則
- **資料歸屬**：每個 `Tournament` 必須屬於一個 `Organization`
- **權限模型**：
  - 使用者透過 `OrganizationMembership` 取得組織層級角色（Owner/Admin/Staff）
  - 賽事層級授權（可選）：`TournamentRole` 允許把某人只指派到特定賽事（例如臨時裁判）
- **資料隔離**：API 查詢必須以「使用者可存取的 Organization」為範圍（避免跨主辦單位看到不相干賽事/名單）

## 6. 交付節奏（MVP）
1. 文件：資料模型 + API 契約 + 狀態機（`docs/`、`db/schema/`）
2. 後端最小可用：建立賽事、報名、付款（假金流）、報到、建立對局、回報結果、查排名
3. 前端 MVP：參賽者入口 + 主辦後台
4. 編排擴充：Swiss / 循環賽 / 淘汰；金流整合；權限與稽核


