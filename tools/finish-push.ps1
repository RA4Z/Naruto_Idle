param(
  [Parameter(Mandatory=$true)][string]$Repository,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$Commit,
  [Parameter(Mandatory=$true)][int]$WaitForProcessId,
  [Parameter(Mandatory=$true)][string]$WaitForStartTime,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$InitialCommit,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$BaselineCommit
)
# One finite continuation of an already-authorized Git operation. No force push,
# recurring scheduling, process termination or commits to unreviewed work.
$ErrorActionPreference='Stop'
$repoPath=[IO.Path]::GetFullPath($Repository)
$gitRoot=Join-Path $repoPath '.git'
if (-not (Test-Path -LiteralPath $gitRoot -PathType Container)) { throw 'Repository unavailable.' }
$statusPath=Join-Path $gitRoot 'codex-push-status.json'
$logPath=Join-Path $gitRoot 'codex-push-worker.log'
function Save-Status([string]$phase,[string]$remote='',[int]$code=0) {
  @{status=$phase;commit=$Commit;remote=$remote;exitCode=$code;updatedAt=[DateTime]::UtcNow.ToString('o');waitForProcessId=$WaitForProcessId} | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding utf8
}
try {
  $origin=(& git -C $repoPath remote get-url origin).Trim()
  if ($origin -ne 'https://github.com/RA4Z/Naruto_Idle.git') { throw 'Remote changed; push cancelled.' }
  & git -C $repoPath cat-file -e ($Commit+'^{commit}')
  if ($LASTEXITCODE -ne 0) { throw 'Reviewed commit unavailable.' }
  Save-Status 'waiting-for-initial-transfer'
  $expected=[DateTime]::Parse($WaitForStartTime).ToUniversalTime()
  $deadline=[DateTime]::UtcNow.AddHours(4)
  while ([DateTime]::UtcNow -lt $deadline) {
    $transfer=Get-Process -Id $WaitForProcessId -ErrorAction SilentlyContinue
    if (-not $transfer) { break }
    if ($transfer.ProcessName -ne 'git' -or [Math]::Abs(($transfer.StartTime.ToUniversalTime()-$expected).TotalSeconds) -gt 2) { break }
    $null=$transfer.WaitForExit(10000)
  }
  if ([DateTime]::UtcNow -ge $deadline) { Save-Status 'initial-transfer-still-running'; exit 2 }
  $remoteLine=& git -C $repoPath ls-remote --heads origin main
  if ($LASTEXITCODE -ne 0) { Save-Status 'remote-check-failed' '' $LASTEXITCODE; exit 3 }
  $remoteSha=($remoteLine -split '\s+')[0]
  if ($remoteSha -eq $Commit) { Save-Status 'complete' $remoteSha; exit 0 }
  if ($remoteSha -notin @($InitialCommit,$BaselineCommit)) { Save-Status 'remote-advanced-review-required' $remoteSha; exit 4 }
  Save-Status 'pushing-reviewed-commit' $remoteSha
  & git -C $repoPath push origin ($Commit+':refs/heads/main') *> $logPath
  $pushExit=$LASTEXITCODE
  if ($pushExit -ne 0) { Save-Status 'push-failed-see-local-log' $remoteSha $pushExit; exit $pushExit }
  $remoteLine=& git -C $repoPath ls-remote --heads origin main
  $remoteSha=($remoteLine -split '\s+')[0]
  if ($remoteSha -eq $Commit) { Save-Status 'complete' $remoteSha; exit 0 }
  Save-Status 'verification-required' $remoteSha; exit 5
} catch {
  Save-Status 'worker-error'; $_.Exception.Message | Add-Content -LiteralPath $logPath; exit 1
}
