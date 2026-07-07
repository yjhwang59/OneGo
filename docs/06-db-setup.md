# DB Setup（PostgreSQL / Docker Compose）

> 目標：讓 OTC 在本機快速起 DB，並套用 `db/schema/otc.sql`。

## 1) 需求
- **方案 A（建議）**：已安裝 Docker Desktop（Windows），可使用 `docker compose`
- **方案 B**：已安裝本機 PostgreSQL（可使用 `psql`）

## 0) Windows on ARM（Snapdragon）重要注意
若你是 **Windows on ARM（ARM64）**，Docker Desktop 可能會因為 WSL 的 `--mount --vhd` 能力不足而無法啟動，常見錯誤包含：
- `Wsl/Service/WSL_E_WSL_MOUNT_NOT_SUPPORTED`
- 提示需要更高的 Windows build（例如 27653+）

在這種情況下建議先走：
- **方案 B（本機 Postgres/psql）**，或
- **方案 C（雲端 Postgres：Neon/Supabase/Render/Railway…）**

本 repo 也提供 **方案 C 的 schema 套用腳本**（見下方第 3.2 節）。

## 2) 啟動 Postgres

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\db-up.ps1
```

預設連線資訊（見 `docker-compose.yml`）：
- Host：`localhost`
- Port：`5432`
- DB：`otc`
- User：`otc`
- Password：`otc_password`

## 3) 套用 schema

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\db-apply-schema.ps1
```

> 這個腳本會透過 `docker exec` 使用容器內的 `psql`，因此本機不需要安裝 psql。

### 3.1（方案 B）使用本機 psql 套用 schema
如果你沒有 Docker，也可以用本機 Postgres + psql：

```powershell
psql "postgres://<user>:<password>@localhost:5432/<db>?sslmode=disable" -f db/schema/otc.sql
```

### 3.2（方案 C）使用 Node + DATABASE_URL 套用 schema（不需要 docker/psql）
1) 在專案根目錄的 `.env` 設定連線（或複製 `config/env.example` 為 `.env` 再改）：

```ini
DB_TARGET=local
DATABASE_URL_LOCAL=postgres://<user>:<password>@<host>:5432/<db>?sslmode=disable
```

2) 執行 schema 套用（會自動讀取 `.env`）：

```powershell
npm run db:apply
```

若不想用 `.env`，可改在 shell 先設定變數再執行腳本：

```powershell
$env:DATABASE_URL="postgres://<user>:<password>@<host>:5432/<db>?sslmode=disable"
node scripts/db-apply-schema.mjs
```

> 注意：`db/schema/otc.sql` 內有 `create extension`，某些雲端 Postgres 可能限制 extension 權限；若遇到權限錯誤，請把錯誤訊息貼給我，我會協助調整 schema（或改成 migration 方式）。

## 4) 設定 API 的 DATABASE_URL（可選）
由於 `.env*` 在某些環境可能被忽略/封鎖，本 repo 用 `config/env.example` 當範例。

你可以在 shell 設定（或自行建立 `.env`，看你的環境規範）：

```powershell
$env:DATABASE_URL = "postgres://otc:otc_password@localhost:5432/otc?sslmode=disable"
```

然後啟動 API：

```powershell
npm run dev:api
```

接著 `GET /api/health` 會回傳 db 狀態（若有設定 DATABASE_URL）。

## 4) 設定平台總管（可選）
平台總管（`platform_admin`）可檢視全平台主辦與用戶，權限儲存於 `users.platform_role`。

**建議做法（免手動 SQL）**，於專案根目錄執行（自動讀 `.env`，使用者不存在會自動建立）：

```bash
npm run grant:admin -- <你的使用者ID>          # 設為平台總管
npm run grant:admin -- <你的使用者ID> --revoke  # 解除
```

或直接於 DB 執行：

```sql
UPDATE users SET platform_role = 'platform_admin' WHERE id = '你的使用者 ID';
```

> 快速建立一整組可測試的角色階層（含平台總管）：`npm run rbac:seed`（需先啟動 API）。

## 5) 疑難排解：找不到 Table users

- **資料庫名稱**：本 repo 預設 Docker 建立的資料庫名稱為 **`otc`**，不是 `OneGoDB`。若你使用的是名為 `OneGoDB`（或其他名稱）的資料庫，需對**該資料庫**套用 schema。
- **確認目前有哪些表**：連到該 DB 後可執行：
  ```sql
  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_type = 'BASE TABLE'
  ORDER BY table_schema, table_name;
  ```
  `users` 會出現在 `public` schema。
- **修正方式**：對你實際使用的資料庫重新套用完整 schema。
  - 若用 **Node 腳本**：在專案根目錄的 `.env` 設定 `DB_TARGET=local` 與 `DATABASE_URL_LOCAL`（或 `DATABASE_URL`）指向你的 DB，再執行：
    ```powershell
    npm run db:apply
    ```
  - 若用 **psql**：
    ```powershell
    psql "postgres://user:pass@host:5432/OneGoDB?sslmode=disable" -f db/schema/otc.sql
    ```
  套用成功後，`public.users` 表就會存在。

### 已有 `users` 表但沒有 `platform_role` 欄位

若表是很早以前建立的，可能缺少後來新增的 `platform_role` 欄位。任選一種方式補上即可：

**方式一：重新套用完整 schema**（建議）  
再次執行 `node scripts/db-apply-schema.mjs` 或 `psql ... -f db/schema/otc.sql`，schema 裡的 `DO $$ ... END $$` 會自動為 `users` 補上 `platform_role`（若尚不存在）。

**方式二：手動加欄位**  
連到該 DB 執行：

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_role text NULL;
```

完成後可執行 `SELECT column_name FROM information_schema.columns WHERE table_name = 'users';` 確認有 `platform_role`。


