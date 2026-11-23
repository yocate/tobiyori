[CmdletBinding()]
param([string]$Task='AGENTS.mdとdocs/collaboration-status.mdを読み、トビヨリの現状を把握してください。まだファイルを変更せず、次の依頼を待ってください。')
$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot -Parent
$native=Join-Path $env:USERPROFILE '.local/bin/claude.exe'
$claude=if(Test-Path -LiteralPath $native){$native}else{(Get-Command claude -ErrorAction Stop).Source}
Push-Location -LiteralPath $repoRoot
try{
 $name='tobiyori-'+(Get-Date -Format 'yyyyMMdd-HHmmss')
 & $claude --worktree $name $Task
}finally{Pop-Location}
