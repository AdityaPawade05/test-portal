# start-devtools.ps1 - Starts PostgreSQL + Redis for local dev
# Run this once before `npm run dev`. Keep the window open while developing.

$root = $PSScriptRoot
$pgBin    = Join-Path $root ".devtools\postgres\bin"
$pgData   = Join-Path $root ".devtools\pgdata"
$pgLog    = Join-Path $root ".devtools\pglogs\postgres.log"
$redisDir = Join-Path $root ".devtools\redis\Redis-8.8.0-Windows-x64-msys2"
$redisBin = Join-Path $redisDir "redis-server.exe"
$redisCli = Join-Path $redisDir "redis-cli.exe"

# PostgreSQL
Write-Host "Starting PostgreSQL on port 5433..." -ForegroundColor Cyan
$pgListening = Get-NetTCPConnection -LocalPort 5433 -ErrorAction SilentlyContinue
if (-not $pgListening) {
    $pidFile = Join-Path $pgData "postmaster.pid"
    if (Test-Path $pidFile) {
        Write-Host "  Removing stale postmaster.pid..." -ForegroundColor Yellow
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
    & "$pgBin\pg_ctl.exe" -D $pgData -l $pgLog start 2>&1 | Out-Null
}
Start-Sleep 2
$pgRunning = netstat -ano 2>$null | Select-String "5433"
if ($pgRunning) {
    Write-Host "  [OK] PostgreSQL is running" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] PostgreSQL failed to start - check $pgLog" -ForegroundColor Red
}

# Redis keep-alive loop
Write-Host "Starting Redis on port 6379 (keep-alive loop active)..." -ForegroundColor Cyan
Write-Host "  Leave this window open. Press Ctrl+C to stop." -ForegroundColor DarkGray

while ($true) {
    $ping = & $redisCli ping 2>$null
    if ($ping -ne "PONG") {
        Write-Host "  Redis not running - restarting..." -ForegroundColor Yellow
        Start-Process -FilePath $redisBin -WorkingDirectory $redisDir -WindowStyle Hidden
        Start-Sleep 2
        $ping2 = & $redisCli ping 2>$null
        if ($ping2 -eq "PONG") {
            Write-Host "  [OK] Redis started" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] Redis failed to start" -ForegroundColor Red
        }
    }
    Start-Sleep 10
}
