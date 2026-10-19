$ErrorActionPreference = 'Stop'
$SaplingRoot = if ($env:SAPLING_BOOTSTRAP_ROOT) { $env:SAPLING_BOOTSTRAP_ROOT } else { [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..')) }
$SaplingLanguage = $env:SAPLING_LANG
# Scratch paths are project-derived before .NET downloads/extraction can run.
foreach ($relative in @('.runtime', '.runtime/tmp', '.cache', '.cache/npm', '.cache/node-compile', '.cache/runtime', 'local-secrets', 'local-secrets/runtime', 'local-secrets/runtime/config', 'data', 'data/runtime', 'data/runtime-state')) {
    $directory = Join-Path $SaplingRoot $relative
    if (Test-Path -LiteralPath $directory) {
        $item = Get-Item -LiteralPath $directory -Force
        if (!$item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Project storage must use ordinary local directories.' }
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
function Say([string]$English, [string]$Chinese) {
    if ($script:SaplingLanguage -eq 'zh') { Write-Host $Chinese } else { Write-Host $English }
}
Say 'Windows bootstrap ready. Checking this device...' 'Windows 安装器已启动，正在检查设备…'
function Resolve-WindowsArchitecture([string]$NativeArchitecture, [string]$WowArchitecture, [string]$ProcessArchitecture) {
    $detected = if ($NativeArchitecture) { $NativeArchitecture } elseif ($WowArchitecture) { $WowArchitecture } else { $ProcessArchitecture }
    switch ($detected.ToUpperInvariant()) {
        { $_ -eq 'AMD64' -or $_ -eq 'X64' } { return 'x64' }
        'ARM64' { return 'arm64' }
        default { throw "Unsupported device architecture: $detected. A 64-bit Windows x64 or ARM64 system is required." }
    }
}
function Get-WindowsDevice {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Detected a non-Windows system. On macOS run bash Saplingagent.sh / 检测到非 Windows 系统，macOS 请运行 bash Saplingagent.sh。' }
    # Registry build avoids compatibility-manifest OS version emulation.
    $windows = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $build = [int]$windows.CurrentBuildNumber
    if ($build -lt 17763) { throw 'Windows 10 version 1809 or later is required. Update Windows before installation / 请先更新到 Windows 10 1809 或更新版本。' }
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
    Say ("Detected device: Windows {0}, {1}. Selecting matching project runtime." -f $device.Version, $architecture) ("检测到设备：Windows {0}，{1}。自动选择对应项目运行环境。" -f $device.Version, $architecture)
    $settings = Get-Content -LiteralPath (Join-Path $SaplingRoot 'kernel/config/windows.json') -Raw | ConvertFrom-Json
    $expectedHash = $settings.nodeSha256.$architecture
    if ($settings.nodeVersion -notmatch '^\d+\.\d+\.\d+$' -or $expectedHash -notmatch '^[a-f0-9]{64}$') { throw 'Invalid Windows runtime configuration.' }
    $runtime = Join-Path $SaplingRoot '.runtime'
    $folderName = "node-v$($settings.nodeVersion)-win-$architecture"
    $target = Join-Path $runtime $folderName
    $node = Join-Path $target 'node.exe'
    if (Test-Path -LiteralPath $node) {
        $version = & $node --version
        $versionPassed = $LASTEXITCODE -eq 0 -and $version -eq "v$($settings.nodeVersion)"
        $nodeArchitecture = & $node -p 'process.arch'
        if ($versionPassed -and $LASTEXITCODE -eq 0 -and $nodeArchitecture -eq $architecture) { return $node }
        throw 'Project Node is damaged. Stop the app, remove only its .runtime/node-v*-win-<detected-architecture> folder, then install again.'
    }
    if (!$Install) { throw 'Install first / 请先选择安装。No runtime will be downloaded by this action.' }
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    $lock = Join-Path $runtime 'windows-node.lock'
    # FileMode.CreateNew is exclusive, unlike New-Item -Force.
    try { $lockHandle = [IO.File]::Open($lock, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None) }
    catch { throw 'Another Node installation is running. See the Windows guide before removing a stale lock.' }
    $stage = Join-Path $runtime ('windows-node-' + [Guid]::NewGuid().ToString('N'))
    $oldTls = [Net.ServicePointManager]::SecurityProtocol
    try {
        foreach ($lease in @('kernel-operation.lock', 'launcher-compile.lock', 'project-finalization.json')) {
            if (Test-Path -LiteralPath (Join-Path $runtime $lease)) { throw 'Finish the active kernel/start/setup operation before installing Node.' }
        }
        New-Item -ItemType Directory -Path $stage | Out-Null
        $archive = Join-Path $stage ($folderName + '.zip')
        Say 'Downloading project-local Node from nodejs.org...' '正在从 nodejs.org 下载项目内 Node…'
        [Net.ServicePointManager]::SecurityProtocol = $oldTls -bor [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$($settings.nodeVersion)/$folderName.zip" -OutFile $archive
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'Node SHA-256 mismatch. Installation stopped.' }
        Expand-Archive -LiteralPath $archive -DestinationPath $stage
        $staged = Join-Path $stage $folderName
        $version = & (Join-Path $staged 'node.exe') --version
        if ($LASTEXITCODE -ne 0 -or $version -ne "v$($settings.nodeVersion)") { throw 'Downloaded Node cannot run on this computer.' }
        $nodeArchitecture = & (Join-Path $staged 'node.exe') -p 'process.arch'
        if ($LASTEXITCODE -ne 0 -or $nodeArchitecture -ne $architecture) { throw 'Downloaded Node architecture does not match this device.' }
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
