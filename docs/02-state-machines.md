# 狀態機（草案）

## 1. 賽事狀態（TournamentStatus）
> 目標：讓 API 與後台 UI 都能用「明確階段」驅動，不靠隱性旗標。

- **draft**：草稿（可編輯賽事設定）
- **published**：已發布（開放報名/付款）
- **checkin_open**：報到開放（允許現場調整）
- **pairing_ready**：可編排（名單凍結或符合編排條件）
- **in_progress**：進行中（已產生對局，開始上傳結果）
- **closed**：結束（成績結算、封存）
- **cancelled**：取消（終止賽事）

### 1.1 推進事件（概念）
- `publish`：draft -> published
- `openCheckIn`：published -> checkin_open
- `lockForPairing`：checkin_open -> pairing_ready
- `startTournament`：pairing_ready -> in_progress
- `closeTournament`：in_progress -> closed
- `cancelTournament`：draft/published/checkin_open/pairing_ready -> cancelled

## 2. 報名狀態（RegistrationStatus）
- **created**：已建立（尚未付款）
- **awaiting_payment**：等待付款（可選：若需要付款流程）
- **paid**：已付款
- **cancelled**：取消報名
- **refunded**：已退款（若支援）

## 3. 付款狀態（PaymentStatus）
> 付款供應商細節必須封裝在 `PaymentProvider`，核心只看狀態與金額/幣別/外部參考。

- **initiated**：已建立付款單
- **pending**：等待支付結果
- **succeeded**：成功
- **failed**：失敗
- **cancelled**：取消
- **refunded**：已退款

## 4. 報到狀態（CheckInStatus）
- **not_checked_in**：未報到
- **checked_in**：已報到
- **withdrawn**：退賽
- **replaced**：被替補（可選）

## 5. 對局狀態（MatchStatus）
- **scheduled**：已排定（未開始）
- **playing**：進行中
- **finished**：已結束（有結果）
- **void**：作廢（例如編排調整）

## 6. 核心不變量（Invariants，草案）
- 只有在 Tournament 狀態允許時，才能：
  - 建立/變更報名（published/checkin_open）
  - 變更報到（checkin_open）
  - 產生編排與 Match（pairing_ready/in_progress）
  - 上傳結果（in_progress）


