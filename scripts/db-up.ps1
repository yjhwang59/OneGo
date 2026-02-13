$ErrorActionPreference = 'Stop'

$dockerCmd = (Get-Command docker -ErrorAction SilentlyContinue)?.Source
if (!$dockerCmd) {
  $fallback = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
  if (Test-Path $fallback) { $dockerCmd = $fallback }
}
if (!$dockerCmd) {
  throw "找不到 docker 指令。請先安裝 Docker Desktop（並確保 docker.exe 在 PATH），或改用你本機既有的 PostgreSQL。"
}

Write-Host "Starting postgres via docker compose..."
& $dockerCmd compose up -d postgres

Write-Host "Done. Postgres should be available on localhost:5432"
Write-Host "Default DB: otc"
Write-Host "Default user: otc"
Write-Host "Default password: otc_password"


