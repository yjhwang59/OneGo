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
1) 先設定 `DATABASE_URL`（可指向本機或雲端 Postgres）：

```powershell
$env:DATABASE_URL="postgres://<user>:<password>@<host>:5432/<db>?sslmode=disable"
```

2) 執行 schema 套用：

```powershell
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


