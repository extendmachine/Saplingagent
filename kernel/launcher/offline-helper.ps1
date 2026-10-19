param([Parameter(Mandatory=$true)][string]$JobDirectory)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $JobDirectory
$job = Get-Content -LiteralPath (Join-Path $JobDirectory 'job.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($job.schemaVersion -ne 1 -or $job.id -notmatch '^[a-f0-9-]{36}$') { throw 'SETUP_JOB_INVALID' }
function Assert-HelperLocation {
  $item = Get-Item -LiteralPath $JobDirectory -Force
  $expected = Join-Path (Split-Path -Parent $job.previousRoot) $job.helper.name
  if (!$job.helper -or $job.helper.name -notmatch '^sapling-setup-[A-Za-z0-9]+$' -or
      [IO.Path]::GetFullPath($JobDirectory) -cne [IO.Path]::GetFullPath($expected) -or
      (Split-Path -Parent $job.targetRoot) -cne (Split-Path -Parent $job.previousRoot) -or
      !$item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'SETUP_HELPER_CHANGED' }
  $owner = Get-Content -LiteralPath (Join-Path $JobDirectory 'job.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($owner.id -ne $job.id -or $owner.helper.name -cne $job.helper.name) { throw 'SETUP_HELPER_CHANGED' }
}
Assert-HelperLocation

$parentProcess = Get-Process -Id $job.management.pid -ErrorAction SilentlyContinue
# Capture the process handle now; WaitForExit cannot accidentally follow a recycled PID.
if ($parentProcess) { $null = $parentProcess.Handle }
[IO.File]::WriteAllText((Join-Path $JobDirectory 'waiting'), '1')
$phaseFailure = 'PROJECT_STOP_PENDING'
try {
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  while ($parentProcess -and -not $parentProcess.WaitForExit(200)) {
    if (Test-Path -LiteralPath (Join-Path $JobDirectory 'cancel')) { return }
    if ([DateTime]::UtcNow -gt $deadline) { throw 'PROJECT_STOP_PENDING' }
  }
  if (Test-Path -LiteralPath (Join-Path $JobDirectory 'cancel')) { return }
  $failure = ''
  try {
    if ($job.previousRoot -cne $job.targetRoot) { [IO.Directory]::Move($job.previousRoot, $job.targetRoot) }
  } catch { $failure = 'PROJECT_RENAME_FAILED' }
  if ((Test-Path -LiteralPath $job.targetRoot) -and -not (Test-Path -LiteralPath $job.previousRoot)) { $currentRoot = $job.targetRoot } else { $currentRoot = $job.previousRoot }
  $phaseFailure = 'PROJECT_RESUME_FAILED'
  $node = Join-Path $currentRoot $job.nodeRelative
  $resume = Join-Path $currentRoot 'kernel/launcher/resume-setup.mjs'
  if ($failure) { & $node $resume $job.id $failure | Out-Null } else { & $node $resume $job.id | Out-Null }
  if ($LASTEXITCODE -ne 0) { throw 'PROJECT_RESUME_FAILED' }
} catch {
  $root = $job.previousRoot
  if ((Test-Path -LiteralPath $job.targetRoot) -and -not (Test-Path -LiteralPath $root)) { $root = $job.targetRoot }
  $statusFile = Join-Path $root '.runtime/setup-finalization.json'
  $current = Get-Content -LiteralPath $statusFile -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($current.id -ne $job.id) { throw 'SETUP_JOB_CHANGED' }
  if ($current.phase -ne 'failed') {
    $status = @{schemaVersion=1;id=$job.id;phase='failed';root=$root;error=@{code=$phaseFailure;message='The setup helper could not finish. Inspect the saved restart lease and close programs using this project before retrying.'}} | ConvertTo-Json -Depth 5
    [IO.File]::WriteAllText($statusFile, $status)
  }
  $html = '<!doctype html><meta charset="utf-8"><title>Saplingagent setup restart</title><h1>Setup restart needs attention</h1><p>Your settings were saved. Close programs using this folder, then run Saplingagent.sh configure from the current project. Inspect .runtime/setup-finalization.json and logs/project-launcher/ before retrying. No automatic rollback was performed.</p>'
  $page = Join-Path $root '.runtime/setup-restart-error.html'
  [IO.File]::WriteAllText($page, $html)
  if (-not $job.noOpen) { Start-Process -FilePath $page -WorkingDirectory ([IO.Path]::GetPathRoot($JobDirectory)) }
} finally {
  if ($parentProcess) { $parentProcess.Dispose() }
  Assert-HelperLocation
  $safeDirectory = Split-Path -Parent $JobDirectory
  Set-Location -LiteralPath $safeDirectory
  [Environment]::CurrentDirectory = $safeDirectory
  # Retry Windows sharing violations only after releasing this helper's handles.
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    try { Assert-HelperLocation; Remove-Item -LiteralPath $JobDirectory -Recurse -Force; break }
    catch { if ($attempt -eq 9) { throw }; Start-Sleep -Milliseconds 200 }
  }
}
