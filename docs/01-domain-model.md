# 核心領域模型（草案）

## 1. 核心實體：Tournament（賽事）
### 1.1 重要欄位（概念）
- **id**：賽事識別
- **name**：賽事名稱
- **gameKey**：棋種（`go` / `chess` / `xiangqi` / `gomoku`）
- **rulesetVersion**：規則版本（例如：`v1`）
- **timezone**：賽事時區
- **status**：賽事狀態（見 `docs/02-state-machines.md`）
- **format**：賽制（Swiss/循環/淘汰…）
- **roundCount**：輪次數（依賽制）
- **winPoint**：單局勝分（預設依棋種；象棋常為 2）
- **byePoint**：輪空給分（未設則同 winPoint）
- **sosKeepTop**：對手分取捨輪數（觀音盃段位組=7；null=全取）

### 1.2 責任邊界
- Tournament 只負責：**賽事本體**與**賽務階段**
- 報名/付款/報到/編排/積分不應把狀態散落在 Tournament 之外的地方又反過來改 Tournament 的語意

## 2. 核心實體：Match（對局）
### 2.1 重要欄位（概念）
- **id**：對局識別
- **tournamentId**：所屬賽事
- **roundNo**：輪次
- **tableNo**：桌次（可選）
- **playerAId / playerBId**：雙方選手；**輪空時 playerBId 為 null**
- **entryKind**：`normal`｜`bye`｜`absent`
- **firstMove**：先手方 A/B
- **status**：對局狀態（scheduled/playing/finished/void…）
- **result**：正規化結果（由 rules 外掛定義/校驗）

### 2.2 責任邊界
- Match 只負責：**單場對局**的雙方、時間、狀態、結果
- 積分與排名屬於 Standings／Scoresheet（`packages/scoring` 計算產物），不要把計分規則寫死在 Match

## 3. 周邊實體（MVP 需要但不侵入核心）
- **User**：登入帳號（參賽者/家長/主辦/工作人員）；可具平台層級角色（如 `platform_admin`），與主辦內角色分開。可經 Google OAuth 註冊，欄位含 `google_sub`（Google 帳號 sub，唯一綁定）、`avatar_url`（頭像 URL，選填）
- **Organization**：主辦單位（多租戶邊界，一個主辦可有多個賽事）；可經 PATCH 更新 name/slug
- **OrganizationMembership**：使用者在**該主辦單位內**的角色（Owner/主辦管理員 Admin/Staff），與系統管理員無關；可移除成員（不可移除最後一位 owner）
- **PlayerProfile**：棋力履歷（可選，MVP 可先用基本資料）
- **TournamentCategory**：賽事組別定義（`key`、`displayName`、`sortOrder`、可選 `capacity`）；報名與對局以 `categoryKey` 引用
- **TournamentRole**：使用者在賽事的角色（Organizer/Staff/Referee）
- **Registration**：報名（user -> tournament + categoryKey）；含 **seedNo** 籤號
- **Payment**：付款（registration -> payment，透過 provider 抽象）
- **CheckIn**：報到
- **MatchFoul**：技術犯規計次（觀音盃輔七）
- **ScoreAdjustment**：總成績加減分（觀音盃第 4 條）
- **MatchResultAudit**：改判軌跡

> 成績計算細節見 [docs/18-scoring-subsystem.md](./18-scoring-subsystem.md)。
- **CheckIn**：報到狀態（registration -> checkin）
- **Participant**：賽事內參賽者視圖（可由 registration + checkin 彙整而來）

## 4. 主要關聯（概念圖文字版）
- Organization 1..N Tournament
- Organization 1..N OrganizationMembership（User 取得組織層級角色）
- Tournament 1..N TournamentCategory（組別定義）
- Tournament 1..N Match
- Tournament 1..N Registration
- Tournament 1..N TournamentRole（賽事層級指派：可把裁判只指派到特定賽事）
- Registration 0..N Payment
- Registration 0..1 CheckIn
 
## 5. 裁判/工作人員指派（需求：可跨賽事，但時間不得重疊）
- **指派方式**：使用 `TournamentRole`（或 schema 內的 `tournament_roles`）把使用者指派為某賽事的 `referee/staff`
- **時間約束**：同一使用者可被指派到多個賽事，但若賽事 `starts_at/ends_at` 有重疊，應在「指派時」阻擋（MVP 先由應用層檢查）


