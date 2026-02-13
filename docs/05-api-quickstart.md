# API Quickstart（MVP）

## 0) 啟動

```bash
npm run dev:api
```

預設：
- Host：`localhost`（同時支援 IPv4/IPv6）
- Port：`3001`

## 1) MVP 的登入方式（暫定）
目前用 request header `x-user-id` 模擬登入（之後會換成正式 Auth）。

範例：
- `x-user-id: alice`（參賽者）
- `x-user-id: org-admin`（主辦）

## 2) 快速測試（curl）

### 2.1 建立主辦單位（Organization）

```bash
curl -s -X POST "http://localhost:3001/api/organizations" ^
  -H "content-type: application/json" ^
  -H "x-user-id: org-admin" ^
  -d "{\"name\":\"OneGo 主辦測試\",\"slug\":\"onego-test\"}"
```

### 2.2 建立賽事（Tournament）
> 注意：建立賽事需要主辦權限（Organization owner/admin）。

```bash
curl -s -X POST "http://localhost:3001/api/tournaments" ^
  -H "content-type: application/json" ^
  -H "x-user-id: org-admin" ^
  -d "{\"organizationId\":\"<ORG_ID>\",\"name\":\"冬季賽\",\"gameKey\":\"go\",\"rulesetVersion\":\"v1\",\"format\":\"swiss\",\"roundCount\":3,\"startsAt\":\"2025-12-20T01:00:00Z\",\"endsAt\":\"2025-12-20T09:00:00Z\"}"
```

### 2.3 發布賽事（開放報名）

```bash
curl -s -X POST "http://localhost:3001/api/tournaments/<TID>/events/publish" ^
  -H "x-user-id: org-admin"
```

### 2.4 參賽者自助報名
> 只有 tournament 狀態為 `published` 或 `checkin_open` 才能報名。

```bash
curl -s -X POST "http://localhost:3001/api/tournaments/<TID>/registrations" ^
  -H "content-type: application/json" ^
  -H "x-user-id: alice" ^
  -d "{\"userId\":\"alice\"}"
```

### 2.5 開放報到 & 主辦替參賽者報到

```bash
curl -s -X POST "http://localhost:3001/api/tournaments/<TID>/events/open-checkin" ^
  -H "x-user-id: org-admin"
```

```bash
curl -s -X POST "http://localhost:3001/api/registrations/<RID>/checkin/events/check-in" ^
  -H "x-user-id: org-admin"
```

### 2.6 鎖定編排 & 產生第 1 輪對局

```bash
curl -s -X POST "http://localhost:3001/api/tournaments/<TID>/events/lock-for-pairing" ^
  -H "x-user-id: org-admin"
```

```bash
curl -s -X POST "http://localhost:3001/api/tournaments/<TID>/pairings/events/generate-round" ^
  -H "content-type: application/json" ^
  -H "x-user-id: org-admin" ^
  -d "{\"roundNo\":1}"
```

### 2.7 開賽 & 上傳結果

```bash
curl -s -X POST "http://localhost:3001/api/tournaments/<TID>/events/start" ^
  -H "x-user-id: org-admin"
```

```bash
curl -s -X POST "http://localhost:3001/api/matches/<MID>/result" ^
  -H "content-type: application/json" ^
  -H "x-user-id: org-admin" ^
  -d "{\"result\":{\"kind\":\"win\",\"winner\":\"A\",\"by\":\"resign\"}}"
```

### 2.8 查排名

```bash
curl -s "http://localhost:3001/api/tournaments/<TID>/standings" ^
  -H "x-user-id: org-admin"
```

半公開：

```bash
curl -s "http://localhost:3001/api/public/tournaments/<TID>/standings"
```


