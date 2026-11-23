[CmdletBinding(SupportsShouldProcess)]
param([Parameter(Mandatory)][string]$Task)
$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot -Parent
$native=Join-Path $env:USERPROFILE '.local/bin/claude.exe'
$claude=if(Test-Path -LiteralPath $native){$native}else{(Get-Command claude -ErrorAction Stop).Source}
if(-not $PSCmdlet.ShouldProcess($repoRoot,'Claude Codeへ読み取り専用レビューを依頼')){return}
$outDir=Join-Path $repoRoot '.agent-reviews'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$resultPath=Join-Path $outDir ((Get-Date -Format 'yyyyMMdd-HHmmss')+'-claude.json')
$prompt="日本語で回答してください。AGENTS.mdとdocs/collaboration-status.mdを読み、次の依頼を確認してください。ファイルは変更せず、私的情報や認証情報を調べたり出力したりしないでください。依頼内容: $Task"
Push-Location -LiteralPath $repoRoot
try{
 $result=$prompt | & $claude -p --restricted --tools 'Read,Glob,Grep' --disallowedTools 'mcp__*' --permission-mode plan --no-session-persistence --output-format json
 if($LASTEXITCODE -ne 0){throw 'Claude Codeの確認が完了しませんでした。ログイン状態と表示されたエラーを確認してください。'}
 $text=$result -join [Environment]::NewLine
 $parsed=$text | ConvertFrom-Json
 if($parsed.is_error){throw 'Claude Codeがエラーを返しました。'}
 [IO.File]::WriteAllText($resultPath,$text,[Text.UTF8Encoding]::new($false))
 Write-Output $parsed.result
 Write-Output "保存先: $resultPath"
}finally{Pop-Location}
