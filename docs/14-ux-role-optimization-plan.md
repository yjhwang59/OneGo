# UX/UI 與各角色前後台優化：分階段實作計畫

> 依據：參考站 PlayGo（`tpego.hyplaygo.com`）競品觀察（見 [04-competitive-notes-playgo.md](04-competitive-notes-playgo.md)）＋ 本專案前後端現況盤點。
> 目標：把目前「功能可用但視覺像開發鷹架」的 OneGo，升級為「可對外辦賽、參賽者願意回訪」的產品。
> 角色定義沿用 [12-roles-and-permissions.md](12-roles-and-permissions.md)：平台總管 / 主辦 owner·admin·staff / 賽事 organizer·staff·referee / 參賽者·訪客。

---

## 0. 現況盤點（作為基準線）

**已具備**
- 三層 RBAC、狀態機 API、報名→付款→報到→編排→結算全鏈路端點（`apps/api`、`apps/web/src/app/api/otc/**`）。
- 頁面骨架：`/`、`/login`、`/tournaments`(+`[id]`)、`/me/registrations`、`/me/tournaments/[id]/matches`、`/referee`(+`[id]`)、`/admin/**`（org / tournaments / platform）。
- RWD（44px 觸控目標）、深色模式（`prefers-color-scheme`）、`AppHeader` / `AdminSidebar` / `UserContext`。

**主要弱點（本計畫要解決的）**
1. 無設計 token 層：`globals.css` 僅預設變數；全站 zinc 單色、狀態 Badge 無語意色。
2. 首頁是簡報（roadmap＋API 展示）而非入口。
3. 導覽非角色感知：所有人都看到「主辦後台／裁判計分」。
4. 參賽者主打「棋力履歷」但無個人中心／戰績／榜單頁。
5. 賽事列表無搜尋/篩選；無已結束賽事歸檔（精彩回顧）。
6. 主辦後台流程散落在個別狀態機端點，缺引導式「作戰台」。
7. 反詐/隱私/多語尚未產品化。

---

## 分階段總覽

| 階段 | 主題 | 主要受益角色 | 相依 | 規模（相對） |
|---|---|---|---|---|
| P0 | 設計系統與角色感知框架 | 全部 | — | 中 |
| P1 | 公開探索與首頁入口 | 訪客/參賽者 | P0 | 中 |
| P2 | 參賽者價值：個人中心＋戰績履歷 | 參賽者 | P0,P1 | 中大 |
| P3 | 主辦後台「作戰台」 | 主辦 owner/admin/staff | P0 | 大 |
| P4 | 裁判計分流＋平台總管儀表板 | referee / platform_admin | P0,P3 | 中 |
| P5 | 信任·隱私·多語（反詐/遮罩/i18n） | 全部 | P1,P2 | 中 |

> 建議順序 P0 → P1 → P2 →（P3 與 P4 可並行）→ P5。P0 是所有視覺升級的地基，必須先做。

---

## P0：設計系統與角色感知框架 ✅（已完成）

**目標**：建立可重用的視覺語彙與角色感知導覽，讓後續每個頁面都「免費」變好看且一致。

> 落地摘要：`globals.css` token 層（品牌/棋種/語意狀態色、圓角/陰影 scale）；`components/ui/`（Badge、StatusBadge、GameBadge、Button、Card、PageHeader、EmptyState、Spinner、ErrorBanner）；`lib/labels.ts`（狀態文案+色調唯一來源）、`lib/roles.ts`（角色 helper）；`AppHeader` 角色感知；後端 `GET /api/me` 補 `orgRoles`/`isReferee`；`me/registrations` 導入新元件作為示範。

**新增**
- `apps/web/src/app/globals.css`（改寫）：定義 CSS 變數 token —
  - 品牌色（建議一組主色 + 棋種色：go/chess/xiangqi/gomoku 各一色）。
  - 語意狀態色：draft / published / checkin_open / pairing_ready / in_progress / closed / cancelled 對應中性/藍/綠/琥珀/紫/灰/紅。
  - 圓角、陰影、間距 scale（沿用現有 rounded-2xl 風格收斂為 token）。
- `apps/web/src/components/ui/`（新元件庫）：
  - `Badge.tsx`（吃 status/gameKey → 自動語意色）
  - `Button.tsx`（primary/secondary/danger/ghost，內建 44px 與 disabled/loading）
  - `Card.tsx`、`PageHeader.tsx`（標題＋說明＋動作區）
  - `EmptyState.tsx`、`Spinner.tsx`、`ErrorBanner.tsx`（收斂現有重複的 loading/error/empty 樣板）
  - `StatusBadge.tsx`（賽事/報名/付款狀態專用，集中 `STATUS_LABEL` 對照表）
- `apps/web/src/lib/labels.ts`：集中 `GAME_LABEL`、`STATUS_LABEL` 等（目前散落在各 page.tsx）。
- `apps/web/src/lib/roles.ts`：從 `UserContext` 衍生 `canAccessAdmin` / `isReferee` / `isPlatformAdmin` 等 helper。

**修改**
- `AppHeader.tsx`：改為角色感知 —
  - 未登入：登入 / 瀏覽賽事 / 榜單。
  - 參賽者：瀏覽賽事 / 我的（下拉：報名·對局·戰績）。
  - 主辦成員：加「主辦後台」。裁判：加「計分」。平台總管：加「平台管理」。
  - 保留開發用「模擬登入」但收進次要位置。

**驗收**
- 任一 status 值在全站顯示同一種顏色與文案（唯一來源 `labels.ts` + `StatusBadge`）。
- 一般參賽者帳號在 Header 看不到「主辦後台/計分」。
- 深色/淺色皆通過 WCAG AA 對比。

---

## P1：公開探索與首頁入口 ✅（已完成）

**目標**：對齊 PlayGo「活動查詢 + 今日比賽 + 精彩回顧」，讓訪客不必登入即可探索。

> 落地摘要：首頁 `page.tsx` 重做為入口（Hero＋CTA、「開放報名中」精選卡、反詐/隱私信任區塊，移除 roadmap/API 展示）；`tournaments/page.tsx` 加入 棋種/狀態/關鍵字/日期區間篩選＋URL query 同步＋結果數＋清除篩選＋空狀態；後端 `GET /api/public/tournaments` 新增 `keyword`（名稱 ILIKE），web proxy 轉發 query；新增 `results/page.tsx` 賽事歸檔（closed→名次榜）。日期區間目前於前端依 `startsAt` 過濾。

**修改 / 新增**
- `apps/web/src/app/page.tsx`（重做首頁）：
  - Hero（一句話價值 + 「瀏覽賽事」「查榜單」CTA）。
  - 「即將開賽 / 開放報名中」精選卡（讀 `public-tournaments` 取近期）。
  - 信任區塊（反詐一行 + 隱私說明，連 P5）。
  - 移除 roadmap/API 展示或收進 `/about`、`/dev`。
- `apps/web/src/app/tournaments/page.tsx`（強化）：
  - 篩選：棋種、狀態、主辦單位、日期區間；關鍵字搜尋（名稱）。
  - URL query 同步（可分享篩選結果）、結果數、清除篩選、優化空狀態。
  - 卡片顯示 StatusBadge、日期、主辦名、報名開關狀態。
- 後端配合：`GET /api/otc/public-tournaments` 支援 query 參數（gameKey/status/orgId/keyword/date）— 若 API 端未支援則先前端過濾，並在 `apps/api` 補查詢參數（記錄於 [03-api-contract.md](03-api-contract.md)）。
- `apps/web/src/app/results/page.tsx`（新）「精彩回顧／賽事歸檔」：列出 `closed` 賽事 + 連向公開名次榜（`public/tournaments/[id]/standings` 已存在）。

**驗收**
- 未登入即可用棋種+狀態篩選並得到正確結果，且重新整理保留篩選（URL query）。
- 首頁可看到至少一筆「開放報名中」賽事並直接進入詳情。

---

## P2：參賽者價值 — 個人中心與戰績履歷 ✅（已完成）

**目標**：兌現「跨棋種棋力成長履歷」賣點（OneGo 對 PlayGo 的差異化）。

> 落地摘要：後端新增 `GET /api/me/record`（跨賽事純函式彙整：overall／byGame 勝率、recentMatches、topOpponents、待繳費/待報到 reminders）；web proxy `me/record`；`me/layout.tsx` 子導覽（總覽/報名/戰績）；`me/page.tsx` 個人中心（待辦提醒＋總覽＋近期對局＋快速入口）；`me/record/page.tsx`（總計＋分棋種勝率條＋常見對手）。以 e2e 種子（E2E Swiss Cup）實測：e2e-p1 3勝winRate=1、e2e-p2 1勝2負winRate=0.33，勝負判定與對手辨識正確。<br>附帶修復：本機 PostgreSQL 缺 `users.status` 欄位（schema drift，導致所有需登入端點 500），已用 `npm run db:apply` 套用冪等遷移補上。

**新增**
- `apps/web/src/app/me/page.tsx`（個人中心首頁）：
  - 基本資料卡、報名/繳費狀態摘要、近期對局、快速入口。
- `apps/web/src/app/me/record/page.tsx`（戰績履歷）：
  - 分棋種統計：勝/和/負、勝率、參賽場次曲線、常見對手。
  - 資料來源：`GET /api/otc/me/registrations` + 各賽事 `me/.../matches` 彙整；如需跨賽事彙整端點，於 `apps/api` 新增 `GET /me/record`（純函式彙整，記錄於 API 契約）。
- `apps/web/src/app/me/layout.tsx`：`me/` 子導覽（總覽 / 報名 / 對局 / 戰績）。

**修改**
- `me/registrations/page.tsx`：狀態改用 StatusBadge、加入繳費狀態欄、對齊新 UI 元件。

**驗收**
- 有多筆跨棋種對局的帳號，戰績頁能正確顯示每棋種勝率與總場次。
- 個人中心一眼看到「待繳費 / 待報到」提醒。

> 依賴：戰績需要對局結果資料；若 seed 資料不足，先補 [07-seed-and-registration-flow.md](07-seed-and-registration-flow.md) 的種子（含已完成對局）以便驗收。

---

## P3：主辦後台「作戰台」 ✅（已完成）

**目標**：把散落的狀態機端點整合為引導式賽事營運流程，降低主辦操作門檻。

> 落地摘要：`admin/tournaments/[id]/page.tsx` 重做為作戰台——頂部狀態機進度條（stepper）＋「下一步」引導動作（呼叫既有 events/*，含 ConfirmDialog 確認與前置說明）；分頁 總覽／報名／報到／編排與對局／成績與排名／角色。報名 tab：搜尋＋分組＋匯出 CSV＋標記繳費；報到 tab：報到狀態看板＋批次報到＋搜尋（新增後端 `GET /api/tournaments/:id/checkins`）；編排：產生輪次＋逐桌上傳結果；成績：即時排名預覽。角色差異：`manageable = platform_admin｜org owner/admin`（由該賽事 org 成員角色判定），staff 進入為唯讀、不顯示「下一步/編輯/報到/角色」等動作，且與後端 `hasTournamentManageAccess` 一致。以腳本實測 11 項（staff 對 publish/check-in 得 403、對 registrations/checkins 讀取 200；owner 全流程 200），全數通過。

**修改 / 新增**
- `apps/web/src/app/admin/tournaments/[id]/page.tsx`（重做為作戰台）：
  - 頂部狀態機進度條：草稿→發布→開放報到→鎖定編排→進行中→結束；每步顯示「下一步動作」按鈕（呼叫既有 `events/*` 端點），含前置條件檢查與確認 dialog。
  - 分頁：總覽 / 報名名單 / 報到 / 編排與對局 / 成績與排名 / 角色。
- `apps/web/src/app/admin/tournaments/[id]/registrations`、`/checkin`、`/pairings`、`/results`（分頁子頁或同頁 tab）：
  - 報名/報到看板：狀態分組、批次報到、搜尋、匯出 CSV。
  - 編排：產生輪次（`pairings/events/generate-round`）、逐桌檢視、缺席/輪空處理。
  - 成績：逐桌輸入結果（`matches/[id]/result`）、作廢/更正、即時排名預覽。
- 角色差異 UI：staff 隱藏「成員管理/建立賽事」；owner 才顯示「刪除主辦/編輯 slug」（依 12 號權限矩陣，前端按鈕與後端一致）。

**驗收**
- 主辦可從草稿一路走到結束，全程在同一作戰台完成，不需手動拼 API。
- staff 帳號看不到也點不到 owner/admin 專屬動作（前端隱藏＋後端 403 一致）。

---

## P4：裁判計分流 ＋ 平台總管儀表板 ✅（已完成）

> 落地摘要：`referee/[id]/page.tsx` 重做為手機優先「逐輪逐桌」清單——每桌兩顆判勝大按鈕＋和局/作廢，1 觸即送出並更新，未輸入桌以琥珀環高亮，`busyMatch` 防重複送出，可收合「即時排名」；`referee/page.tsx` 套用設計系統。平台端新增 `admin/platform/page.tsx` 儀表板（主辦/用戶/賽事/進行中量化卡＋最近註冊＋管理入口，後端 `GET /api/platform/stats`）；`admin/platform/users/[id]` 停權改用 `ConfirmDialog` 確認流程＋稽核提示，`id===userId` 顯示「無法停權自己」防呆。實測：stats 回正確計數且非總管 403；被指派 referee 讀對局並送出結果 200、排名即時更新。

**裁判（手機優先）**
- `apps/web/src/app/referee/[id]/page.tsx`（強化）：
  - 逐輪逐桌清單、單手可操作的結果輸入（勝方/和局/作廢）、送出即更新、未輸入高亮、防重複送出。
  - 依 `me/referee-tournaments` 進入被指派賽事。

**平台總管**
- `apps/web/src/app/admin/platform/page.tsx`（新儀表板）：
  - 全站量化卡（主辦數/用戶數/賽事數/進行中賽事）、最近註冊、停權操作入口。
- 強化 `admin/platform/users/[id]`：停權/解除的確認流程與稽核提示（防呆：不可停權自己，已於 API 實作）。

**驗收**
- 裁判在手機上 3 次點擊內完成一桌計分並看到排名更新。
- 總管首頁可綜覽全站並直接進入停權操作。

---

## P5：信任 · 隱私 · 多語 ✅（反詐＋遮罩完成；i18n 選配，延後）

**目標**：對齊 PlayGo 的反詐/遮罩，並補上多語基礎（差異化加分）。

> 落地摘要：新增 `components/ui/AntiFraudNotice.tsx`（固定反詐文案），套用於參賽者付款相關頁 `me/registrations`（首頁亦已有信任區塊）；新增 `lib/privacy.ts` `maskName()`（中文姓氏＋◯ 遮罩、英文/代號首字＋末兩碼、中間 • 遮罩），套用於公開賽事頁 `tournaments/[id]` 的公開名次榜與報名名單，並加註「已遮罩」說明。i18n（next-intl／輕量 dictionary）為計畫標示之選配項，本次延後（`labels.ts` 已集中大部分文案，未來導入成本低）。

- `apps/web/src/components/ui/AntiFraudNotice.tsx`：付款頁/通知模板固定反詐文案（「絕不要求儲值/代辦退費」）。
- 隱私遮罩：公開名次榜/名單以姓氏+代號遮罩；未成年保護；集中於 `lib/privacy.ts`（`maskName()`）。於 `public/.../standings`、`results` 頁套用。
- i18n（選配）：導入 `next-intl` 或輕量 dictionary（繁/簡/英），先抽 `labels.ts` 與頁面標題字串；語言切換放 Header。

**驗收**
- 公開榜單預設顯示遮罩姓名；付款相關頁面皆有反詐提示。
- （若做 i18n）切換語言後導覽與狀態文案同步切換。

---

## 相依與風險

- **P0 是地基**：先做才能避免各頁面重複刷樣式。
- **API 缺口**：P1 篩選、P2 戰績彙整可能需 `apps/api` 補查詢/彙整端點；先前端過濾可解耦，但正式化需更新 [03-api-contract.md](03-api-contract.md)。
- **種子資料**：P2/P4 驗收需要「已完成對局」的種子；先補 seed。
- **前後端權限一致**：P3/P4 前端隱藏動作必須對齊後端 `rbac.ts`，避免只藏 UI 不擋 API。

## 建議里程碑

- M1（P0+P1）：對外可探索、視覺一致 → 可用於 demo/招商。
- M2（P2）：參賽者回訪動機成立。
- M3（P3+P4）：主辦/裁判/總管營運閉環。
- M4（P5）：信任與國際化打磨、上線前收尾。
