$ErrorActionPreference = 'Stop'
Write-Host '先にアプリで新規登録してください。指定するアカウントは団体の確認・公開審査ができるようになります。'
$operatorEmail = Read-Host '運営管理者にする、登録済みのメールアドレス'
if ($operatorEmail -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { Write-Host 'メールアドレスを確認してください。'; Read-Host 'Enterで閉じます'; exit }
& node (Join-Path $PSScriptRoot 'manage-tobiyori.cjs') admin $operatorEmail
Read-Host 'Enterで閉じます'
