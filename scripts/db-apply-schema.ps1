$ErrorActionPreference = 'Stop'

param(
  [string]$ContainerName = "otc-postgres",
  [string]$DbUser = "otc",
  [string]$DbName = "otc",
  [string]$SchemaPath = "db/schema/otc.sql"
)

$dockerCmd = (Get-Command docker -ErrorAction SilentlyContinue)?.Source
if (!$dockerCmd) {
  $fallback = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
  if (Test-Path $fallback) { $dockerCmd = $fallback }
}
if (!$dockerCmd) {
  throw "找不到 docker 指令。若你不是用 docker 跑 Postgres，請改用本機 psql 套用 schema，或先安裝 Docker Desktop。"
}

if (!(Test-Path $SchemaPath)) {
  throw "Schema file not found: $SchemaPath"
}

Write-Host "Applying schema $SchemaPath to $ContainerName ($DbUser@$DbName)..."

# 透過 docker exec 走容器內 psql（避免本機未安裝 psql）
Get-Content $SchemaPath -Raw | & $dockerCmd exec -i $ContainerName psql -U $DbUser -d $DbName

Write-Host "Done."


