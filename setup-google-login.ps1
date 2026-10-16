$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'GoogleからダウンロードしたOAuthクライアントのJSONファイルを選択'
$dialog.Filter = 'Google設定ファイル (*.json)|*.json'
if ($dialog.ShowDialog() -ne 'OK') { exit }
try {
  $googleSettings = Get-Content -LiteralPath $dialog.FileName -Raw -Encoding UTF8 | ConvertFrom-Json
  $webClient = $googleSettings.web
  $expectedRedirect = 'http://localhost:4177/api/google/callback'
  if (-not $webClient -or $webClient.client_id -notmatch '^[\w-]+\.apps\.googleusercontent\.com$' -or $webClient.client_secret.Length -lt 8) {
    throw 'ウェブ アプリケーション用のOAuthクライアントJSONを選んでください。'
  }
  if ($webClient.redirect_uris -notcontains $expectedRedirect) {
    throw ('Google側に次のリダイレクトURIを登録し、JSONをもう一度ダウンロードしてください。' + [Environment]::NewLine + $expectedRedirect)
  }
  $settingsDir = Join-Path $PSScriptRoot '.tobiyori-data'
  New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null
  $settingsFile = Join-Path $settingsDir 'google-oauth.json'
  $selectedConfig = @{client_id=$webClient.client_id;client_secret=$webClient.client_secret} | ConvertTo-Json
  [System.IO.File]::WriteAllText($settingsFile,$selectedConfig,(New-Object System.Text.UTF8Encoding($false)))
  [System.Windows.Forms.MessageBox]::Show('Googleログインの設定を保存しました。アプリを起動し、ログイン画面を再読み込みしてください。','トビヨリ') | Out-Null
} catch {
  [System.Windows.Forms.MessageBox]::Show('設定を保存できませんでした。ウェブ アプリケーション用のJSONと、リダイレクトURI（http://localhost:4177/api/google/callback）を確認してください。','トビヨリ') | Out-Null
} finally { $dialog.Dispose() }
