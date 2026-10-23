$ErrorActionPreference = 'Stop'
$SaplingRoot = if ($env:SAPLING_BOOTSTRAP_ROOT) { $env:SAPLING_BOOTSTRAP_ROOT } else { [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..')) }
$SaplingLanguage = $env:SAPLING_LANG
. (Join-Path $SaplingRoot 'kernel/localization/installer-messages.ps1')
# Scratch paths are project-derived before .NET downloads/extraction can run.
foreach ($relative in @('.runtime', '.runtime/tmp', '.cache', '.cache/npm', '.cache/node-compile', '.cache/runtime', 'local-secrets', 'local-secrets/runtime', 'local-secrets/runtime/config', 'data', 'data/runtime', 'data/runtime-state')) {
    $directory = Join-Path $SaplingRoot $relative
    if (Test-Path -LiteralPath $directory) {
        $item = Get-Item -LiteralPath $directory -Force
        if (!$item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw (Message 'windows_003') }
    } else { [IO.Directory]::CreateDirectory($directory) | Out-Null }
}
$env:TMP = Join-Path $SaplingRoot '.runtime/tmp'
$env:TEMP = $env:TMP
$env:TMPDIR = $env:TMP
$env:npm_config_cache = Join-Path $SaplingRoot '.cache/npm'
$env:NODE_COMPILE_CACHE = Join-Path $SaplingRoot '.cache/node-compile'
$env:XDG_CONFIG_HOME = Join-Path $SaplingRoot 'local-secrets/runtime/config'
$env:XDG_DATA_HOME = Join-Path $SaplingRoot 'data/runtime'
$env:XDG_STATE_HOME = Join-Path $SaplingRoot 'data/runtime-state'
$env:XDG_CACHE_HOME = Join-Path $SaplingRoot '.cache/runtime'

# Undo MSYS argument-conversion overrides before any application child starts.
[Environment]::SetEnvironmentVariable('MSYS2_ARG_CONV_EXCL', $env:SAPLING_PREVIOUS_ARG_CONV, 'Process')
[Environment]::SetEnvironmentVariable('MSYS2_ENV_CONV_EXCL', $env:SAPLING_PREVIOUS_ENV_CONV, 'Process')
Write-Host (Message 'windows_004')
function Resolve-WindowsArchitecture([string]$NativeArchitecture, [string]$WowArchitecture, [string]$ProcessArchitecture) {
    $detected = if ($NativeArchitecture) { $NativeArchitecture } elseif ($WowArchitecture) { $WowArchitecture } else { $ProcessArchitecture }
    switch ($detected.ToUpperInvariant()) {
        { $_ -eq 'AMD64' -or $_ -eq 'X64' } { return 'x64' }
        'ARM64' { return 'arm64' }
        default { throw ((Message 'unsupported_arch') -f $detected) }
    }
}
function Get-WindowsDevice {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw (Message 'windows_005') }
    # Registry build avoids compatibility-manifest OS version emulation.
    $windows = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $build = [int]$windows.CurrentBuildNumber
    if ($build -lt 17763) { throw (Message 'windows_006') }
    # Native OS architecture wins over an emulated/32-bit terminal's architecture.
    $native = $null
    try { $native = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() } catch {}
    if (!$native) { $native = [Environment]::GetEnvironmentVariable('PROCESSOR_ARCHITECTURE', 'Machine') }
    $architecture = Resolve-WindowsArchitecture $native $env:PROCESSOR_ARCHITEW6432 $env:PROCESSOR_ARCHITECTURE
    return @{ Platform = 'Windows'; Architecture = $architecture; Version = "10.0.$build" }
}
function Ensure-Node([bool]$Install) {
    $device = Get-WindowsDevice
    $architecture = $device.Architecture
    Write-Host ((Message 'detected_device') -f $device.Version, $architecture)
    $settings = Get-Content -LiteralPath (Join-Path $SaplingRoot 'kernel/config/windows.json') -Raw | ConvertFrom-Json
    $expectedHash = $settings.nodeSha256.$architecture
    if ($settings.nodeVersion -notmatch '^\d+\.\d+\.\d+$' -or $expectedHash -notmatch '^[a-f0-9]{64}$') { throw (Message 'windows_007') }
    $runtime = Join-Path $SaplingRoot '.runtime'
    $folderName = "node-v$($settings.nodeVersion)-win-$architecture"
    $target = Join-Path $runtime $folderName
    $node = Join-Path $target 'node.exe'
    if (Test-Path -LiteralPath $node) {
        $version = & $node --version
        $versionPassed = $LASTEXITCODE -eq 0 -and $version -eq "v$($settings.nodeVersion)"
        $nodeArchitecture = & $node -p 'process.arch'
        if ($versionPassed -and $LASTEXITCODE -eq 0 -and $nodeArchitecture -eq $architecture) { return $node }
        throw (Message 'windows_008')
    }
    if (!$Install) { throw (Message 'windows_009') }
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    $lock = Join-Path $runtime 'windows-node.lock'
    # FileMode.CreateNew is exclusive, unlike New-Item -Force.
    try { $lockHandle = [IO.File]::Open($lock, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None) }
    catch { throw (Message 'windows_010') }
    $stage = Join-Path $runtime ('windows-node-' + [Guid]::NewGuid().ToString('N'))
    $oldTls = [Net.ServicePointManager]::SecurityProtocol
    try {
        foreach ($lease in @('kernel-operation.lock', 'launcher-compile.lock', 'project-finalization.json')) {
            if (Test-Path -LiteralPath (Join-Path $runtime $lease)) { throw (Message 'windows_011') }
        }
        New-Item -ItemType Directory -Path $stage | Out-Null
        $archive = Join-Path $stage ($folderName + '.zip')
        Write-Host (Message 'windows_012')
        [Net.ServicePointManager]::SecurityProtocol = $oldTls -bor [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$($settings.nodeVersion)/$folderName.zip" -OutFile $archive
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw (Message 'windows_013') }
        Expand-Archive -LiteralPath $archive -DestinationPath $stage
        $staged = Join-Path $stage $folderName
        $version = & (Join-Path $staged 'node.exe') --version
        if ($LASTEXITCODE -ne 0 -or $version -ne "v$($settings.nodeVersion)") { throw (Message 'windows_014') }
        $nodeArchitecture = & (Join-Path $staged 'node.exe') -p 'process.arch'
        if ($LASTEXITCODE -ne 0 -or $nodeArchitecture -ne $architecture) { throw (Message 'windows_015') }
        Move-Item -LiteralPath $staged -Destination $target
        return $node
    } finally {
        [Net.ServicePointManager]::SecurityProtocol = $oldTls
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        $lockHandle.Dispose()
        Remove-Item -LiteralPath $lock -Force -ErrorAction SilentlyContinue
    }
}
function Invoke-Sapling([string]$Command, [string[]]$Extra = @()) {
    $node = Ensure-Node ($Command -eq 'install' -or $Command -eq 'runtime-only')
    if ($Command -eq 'runtime-only') { return 0 }
    $names = @('PATH', 'SAPLING_LANG', 'SEED_ROOT', 'SEED_IMPORT_EXISTING_AUTH')
    $previous = @{}
    foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
    try {
        $env:PATH = (Split-Path -Parent $node) + ';' + $env:PATH
        $env:SAPLING_LANG = $script:SaplingLanguage
        $env:SEED_ROOT = $SaplingRoot
        $env:SEED_IMPORT_EXISTING_AUTH = '0'
        # Inherit the real console so OpenCode's interactive auth has a TTY.
        # ProcessStartInfo takes a Windows argv string in .NET Framework 4.x.
        $arguments = @((Join-Path $SaplingRoot 'kernel/scripts/launcher/cli.mjs'), $Command) + $Extra
        $quoted = foreach ($argument in $arguments) {
            '"' + ($argument -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
        }
        $info = New-Object System.Diagnostics.ProcessStartInfo
        $info.FileName = $node
        $info.Arguments = $quoted -join ' '
        $info.WorkingDirectory = $SaplingRoot
        $info.UseShellExecute = $false
        $owned = [Diagnostics.Process]::Start($info)
        try {
            while (!$owned.HasExited) { Start-Sleep -Milliseconds 100 }
            return $owned.ExitCode
        } finally {
            if (!$owned.HasExited) {
                & (Join-Path $env:SystemRoot 'System32/taskkill.exe') /PID $owned.Id /T /F | Out-Null
            }
            $owned.Dispose()
        }
    } finally {
        foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    }
}

try {
    $extra = @()
    if ($env:SAPLING_BOOTSTRAP_FLAG) { $extra += $env:SAPLING_BOOTSTRAP_FLAG }
    if ($env:SAPLING_BOOTSTRAP_SECOND_FLAG) { $extra += $env:SAPLING_BOOTSTRAP_SECOND_FLAG }
    $action = if ($env:SAPLING_BOOTSTRAP_ACTION) { $env:SAPLING_BOOTSTRAP_ACTION } else { 'runtime-only' }
    $code = Invoke-Sapling $action $extra
    exit $code
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
