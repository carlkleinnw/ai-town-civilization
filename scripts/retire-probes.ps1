param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$workspaceRoot = Split-Path -Parent $projectRoot
$probeRoot = (Resolve-Path -LiteralPath (Join-Path $workspaceRoot 'tmp')).Path
$evidence = Join-Path $projectRoot '.runtime/lifecycle'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
# Reviewed completed storage/runtime experiments only. Coursework PDFs and progress probe stay.
$names = @(
 'governance-rebuild-2026-10-27T11-28-06-008Z', 'launcher-failure-1793101089626',
 'runtime-existing-retention', 'runtime-feature-verification',
 'runtime-feature-verification-1793100640276', 'runtime-feature-verification-1793102094990',
 'runtime-feature-verification-final', 'runtime-governance-final-restore',
 'runtime-governance-final2-restore', 'runtime-governance-restore',
 'runtime-retention-verification', 'runtime-retention-verification-2',
 'runtime-retention-verification-3', 'runtime-retention-verification-4',
 'runtime-retention-verification-5', 'storage-final-restic-restore',
 'storage-logical-probe', 'storage-restic-restore', 'storage-retention-probe'
)
$targets = @($names | ForEach-Object {
 $candidate = Join-Path $probeRoot $_
 if (Test-Path -LiteralPath $candidate) {
  $resolved = (Resolve-Path -LiteralPath $candidate).Path
  if ((Split-Path -Parent $resolved) -ne $probeRoot -or
      -not $resolved.StartsWith($probeRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
   throw 'Probe target escaped reviewed root'
  }
  $resolved
 }
})
if (-not $Apply) { $targets; return }
if (-not $targets.Count) { Write-Output 'No reviewed probes remain'; return }
$processes = Get-CimInstance Win32_Process
$dependencyLinks = @()
foreach ($target in $targets) {
 if ($processes | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($target, [StringComparison]::OrdinalIgnoreCase) -ge 0 }) {
  throw 'A reviewed probe is still used by a process'
 }
 if ((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked target' }
 foreach ($link in @(Get-ChildItem -LiteralPath $target -Force -Recurse | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })) {
  $destination = @($link.Target)
  if ($link.Name -ne 'node_modules' -or $link.LinkType -ne 'Junction' -or $destination.Count -ne 1 -or
      [IO.Path]::GetFullPath($destination[0]) -ne (Join-Path $projectRoot 'node_modules')) {
   throw 'Unrecognized link; no deletion permitted'
  }
  $dependencyLinks += $link.FullName
 }
}
$targetsFile = Join-Path $evidence 'retired-targets.json'
ConvertTo-Json -InputObject $targets | Set-Content -LiteralPath $targetsFile -Encoding utf8
$manifest = Join-Path $evidence 'retired-manifest.json'
& python (Join-Path $PSScriptRoot 'verify-retired-probes.py') manifest $manifest $targetsFile
if ($LASTEXITCODE -ne 0) { throw 'Manifest failed' }
$resticExe = Join-Path $workspaceRoot 'tools/restic/restic_0.19.1_windows_amd64.exe'
$resticArgs = @('-r', (Join-Path $workspaceRoot 'backups/restic'), '--password-file', (Join-Path $workspaceRoot 'backups/.restic-password'))
$env:RESTIC_CACHE_DIR = Join-Path $projectRoot '.runtime/storage/restic-cache'
$env:TEMP = Join-Path $projectRoot '.runtime/storage/temp'
$env:TMP = $env:TEMP
$output = & $resticExe @resticArgs backup @targets --exclude node_modules --tag critical-retired-probes --json
if ($LASTEXITCODE -ne 0) { throw 'Archive failed' }
$summary = @($output | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object message_type -eq summary)[-1]
$snapshot = $summary.snapshot_id
if ($snapshot -notmatch '^[a-f0-9]{64}$') { throw 'Missing snapshot' }
@{ snapshot = $snapshot; addedBytes = $summary.data_added_packed; targets = $targets } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $evidence 'retired-backup.json') -Encoding utf8
& $resticExe @resticArgs check
if ($LASTEXITCODE -ne 0) { throw 'Repository check failed' }
$restore = Join-Path $evidence ('retired-restore-' + $snapshot.Substring(0, 8))
if (Test-Path -LiteralPath $restore) { throw 'Restore destination exists; inspect interrupted run' }
& $resticExe @resticArgs restore $snapshot --target $restore --verify
if ($LASTEXITCODE -ne 0) { throw 'Actual restore verification failed' }
& python (Join-Path $PSScriptRoot 'verify-retired-probes.py') verify $manifest $restore
if ($LASTEXITCODE -ne 0) { throw 'Exact source/restore comparison failed' }
# Recheck process use immediately before deletion. Only these resolved direct children are removed.
$processes = Get-CimInstance Win32_Process
foreach ($link in $dependencyLinks) {
 $current = Get-Item -LiteralPath $link -Force
 if ($current.LinkType -ne 'Junction' -or @($current.Target).Count -ne 1 -or
     [IO.Path]::GetFullPath(@($current.Target)[0]) -ne (Join-Path $projectRoot 'node_modules')) { throw 'Dependency link changed' }
 # Directory.Delete without recursion removes this junction itself, never its target contents.
 [IO.Directory]::Delete($link)
 if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules/convex/package.json'))) { throw 'Dependency target check failed' }
}
foreach ($target in $targets) {
 if ($processes | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($target, [StringComparison]::OrdinalIgnoreCase) -ge 0 }) { throw 'Probe became active' }
 if ((Resolve-Path -LiteralPath $target).Path -ne $target -or (Split-Path -Parent $target) -ne $probeRoot) { throw 'Target changed' }
 Remove-Item -LiteralPath $target -Recurse -Force
}
$resolvedRestore = (Resolve-Path -LiteralPath $restore).Path
if ((Split-Path -Parent $resolvedRestore) -ne (Resolve-Path -LiteralPath $evidence).Path) { throw 'Restore target escaped evidence root' }
Remove-Item -LiteralPath $resolvedRestore -Recurse -Force
@{ completedAt = (Get-Date).ToString('o'); snapshot = $snapshot; verified = $true; removed = $targets; excludedRegenerableDependencies = 'node_modules' } |
 ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $evidence 'retired-result.json') -Encoding utf8
Write-Output ('Retired verified probes: ' + $targets.Count + '; recoverable snapshot: ' + $snapshot)
