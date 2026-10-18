#!/bin/bash
set -euo pipefail
SAPLING_WINDOWS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
say() { if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "$2"; else printf '%s\n' "$1"; fi; }
SAPLING_WINDOWS_ACTION="${1:-}"
if [ "$#" -gt 0 ]; then shift; fi
SAPLING_WINDOWS_FLAG="${1:-}"
SAPLING_WINDOWS_SECOND_FLAG="${2:-}"
case "$SAPLING_WINDOWS_ACTION:$#:$SAPLING_WINDOWS_FLAG" in
  install:0:|login:0:|configure:0:|opencode:0:|start:0:|doctor:0:|logout:0:|install:1:--repair|login:1:--device-auth|start:1:--no-open|configure:1:--no-open) ;;
  kernel:0:|kernel:1:status|kernel:1:check|kernel:1:update) ;;
  kernel:2:update) [ "$SAPLING_WINDOWS_SECOND_FLAG" = --accept-risk ] || exit 2 ;;
  kernel:2:restore) [[ "$SAPLING_WINDOWS_SECOND_FLAG" =~ ^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$ ]] || exit 2 ;;
  *) say 'Invalid action/flag. Run bash Saplingagent.sh --help.' '操作或参数无效。请运行 bash Saplingagent.sh --help。' >&2; exit 2 ;;
esac
for SAPLING_WINDOWS_TOOL in cygpath powershell.exe iconv base64; do
  if ! command -v "$SAPLING_WINDOWS_TOOL" >/dev/null 2>&1; then
    say "Missing $SAPLING_WINDOWS_TOOL. Use Git Bash from https://gitforwindows.org/." "缺少 $SAPLING_WINDOWS_TOOL。请使用 https://gitforwindows.org/ 提供的 Git Bash。" >&2
    exit 1
  fi
done
export SAPLING_BOOTSTRAP_ROOT="$(cygpath -w "$SAPLING_WINDOWS_ROOT")"
export SAPLING_GIT_BASH="$(cygpath -w "$(command -v bash)")"
export SAPLING_BOOTSTRAP_ACTION="$SAPLING_WINDOWS_ACTION"
export SAPLING_BOOTSTRAP_FLAG="$SAPLING_WINDOWS_FLAG"
export SAPLING_BOOTSTRAP_SECOND_FLAG="$SAPLING_WINDOWS_SECOND_FLAG"
export SAPLING_PREVIOUS_ARG_CONV="${MSYS2_ARG_CONV_EXCL:-}"
export SAPLING_PREVIOUS_ENV_CONV="${MSYS2_ENV_CONV_EXCL:-}"
SAPLING_WINDOWS_PROGRAM="$(cat <<'SAPLING_POWERSHELL'
$ErrorActionPreference = 'Stop'
$SaplingRoot = $env:SAPLING_BOOTSTRAP_ROOT
$SaplingLanguage = $env:SAPLING_LANG
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
    $settings = Get-Content -LiteralPath (Join-Path $SaplingRoot 'config/windows.json') -Raw | ConvertFrom-Json
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
        if (Test-Path -LiteralPath (Join-Path $runtime 'kernel-operation.lock')) { throw 'Finish the active kernel/start operation before installing Node.' }
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
    $node = Ensure-Node ($Command -eq 'install')
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
        $arguments = @((Join-Path $SaplingRoot 'scripts/launcher/cli.mjs'), $Command) + $Extra
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
    $code = Invoke-Sapling $env:SAPLING_BOOTSTRAP_ACTION $extra
    exit $code
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
SAPLING_POWERSHELL
)"
# EncodedCommand keeps Unicode paths/messages and avoids native argv reinterpretation.
# The command is an argument, leaving stdin available for interactive provider auth.
SAPLING_WINDOWS_ENCODED="$(printf '%s' "$SAPLING_WINDOWS_PROGRAM" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\r\n')"
export MSYS2_ARG_CONV_EXCL='*'
export MSYS2_ENV_CONV_EXCL='SAPLING_BOOTSTRAP_ROOT'
# First install and kernel CLI need a foreground native console,
# just like authentication/startup. Diagnostics still runs directly.
case "$SAPLING_WINDOWS_ACTION" in
  install|login|opencode|start|kernel)
    if [ -t 0 ] && [ -t 1 ] && command -v winpty >/dev/null 2>&1; then
      say "Starting Windows $SAPLING_WINDOWS_ACTION (PowerShell / winpty)..." "正在启动 Windows ${SAPLING_WINDOWS_ACTION}（PowerShell / winpty）…"
      exec winpty powershell.exe -NoLogo -NoProfile -EncodedCommand "$SAPLING_WINDOWS_ENCODED"
    fi ;;
esac
say "Starting Windows $SAPLING_WINDOWS_ACTION (PowerShell)..." "正在启动 Windows ${SAPLING_WINDOWS_ACTION}（PowerShell）…"
exec powershell.exe -NoLogo -NoProfile -EncodedCommand "$SAPLING_WINDOWS_ENCODED"
