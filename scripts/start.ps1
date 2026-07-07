# OneGo 前後端啟動腳本
# 1. 先停掉佔用 3874、3875 的程式
# 2. 啟動 API (port 3875) 與 Web (port 3874)

$ErrorActionPreference = 'Stop'
$ApiPort = 3875
$WebPort = 3874

function Stop-Port($Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
  if ($conn) {
    $pids = $conn.OwningProcess | Sort-Object -Unique
    foreach ($procId in $pids) {
      Write-Host "Stopping process on port $Port (PID $procId)..."
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Host "Stopping any process on port $ApiPort and $WebPort..."
Stop-Port $ApiPort
Stop-Port $WebPort
Start-Sleep -Seconds 1

$root = Split-Path -Parent $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
Set-Location $root

Write-Host "Starting API (port $ApiPort)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; npm run dev:api"

Start-Sleep -Seconds 2

Write-Host "Starting Web (port $WebPort)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; npm run dev"

Write-Host "Done. API: http://127.0.0.1:$ApiPort  Web: http://localhost:$WebPort"
Write-Host "Close the two opened windows to stop the servers."
