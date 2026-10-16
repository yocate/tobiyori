$ErrorActionPreference = 'Stop'
$tobiyoriRoot = $PSScriptRoot
$tobiyoriUrl = 'http://localhost:4177'
$tobiyoriRunning = $false
try {
  $health = Invoke-RestMethod "$tobiyoriUrl/api/health" -TimeoutSec 2
  $tobiyoriRunning = $health.app -eq 'tobiyori'
} catch {}
if (-not $tobiyoriRunning) {
  $runtime = (Get-Command node -ErrorAction Stop).Source
  $dataPath = Join-Path $tobiyoriRoot '.tobiyori-data'
  New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
  $serverFile = Join-Path $tobiyoriRoot 'tobiyori-server.cjs'
  Start-Process -FilePath $runtime -ArgumentList ('"' + $serverFile + '"') -WorkingDirectory $tobiyoriRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataPath 'server.log') -RedirectStandardError (Join-Path $dataPath 'server-error.log')
  for ($attempt=0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 300
    try {
      $health = Invoke-RestMethod "$tobiyoriUrl/api/health" -TimeoutSec 1
      if ($health.app -eq 'tobiyori') { $tobiyoriRunning=$true; break }
    } catch {}
  }
}
if ($tobiyoriRunning) { Start-Process $tobiyoriUrl }
else {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show('アプリを起動できませんでした。ポート4177が使用中でないか確認してください。','トビヨリ') | Out-Null
}
