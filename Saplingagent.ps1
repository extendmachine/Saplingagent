#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('en', 'zh')][string]$Lang = 'en',
    [ValidateSet('', 'install', 'login', 'opencode', 'start', 'doctor', 'logout', 'help')][string]$Action = '',
    [switch]$Repair, [switch]$DeviceAuth, [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$SaplingRoot = $PSScriptRoot
$SaplingLanguage = $Lang

function Say([string]$English, [string]$Chinese) {
    if ($script:SaplingLanguage -eq 'zh') { Write-Host $Chinese } else { Write-Host $English }
}
function Read-Choice([string]$Prompt) {
    if ([Console]::IsInputRedirected) {
        $value = [Console]::ReadLine()
        if ($null -eq $value) { return '0' }
        Write-Host "${Prompt}: $value"
        return $value
    }
    return (Read-Host $Prompt)
}
function Choose-Language {
    while ($true) {
        Write-Host "`nLanguage / 语言`n  1. English`n  2. 中文`n  0. Quit / 退出"
        $choice = Read-Choice 'Choose / 请选择 [Enter=English]'
        switch ($choice) {
            '0' { return $false }
            '2' { $script:SaplingLanguage = 'zh'; return $true }
            { $_ -eq '1' -or $_ -eq '' } { $script:SaplingLanguage = 'en'; return $true }
            default { Write-Host 'Please enter 0, 1 or 2 / 请输入 0、1 或 2。' }
        }
    }
}
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
function Run-MenuAction([string]$Command) {
    try {
        $code = Invoke-Sapling $Command
        if ($code -ne 0) { Say "Operation incomplete (exit $code). Retry or choose Diagnostics." "操作未完成（退出码 $code）。可以重试或选择服务诊断。" }
    } catch { Write-Host $_.Exception.Message -ForegroundColor Red }
}

if ($Action -eq 'help') {
    Write-Host 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Saplingagent.ps1 [-Lang en|zh] [-Action install|login|opencode|start|doctor|logout] [-Repair|-DeviceAuth|-NoOpen]'
    exit 0
}
if ($Action) {
    if (($Repair -and $Action -ne 'install') -or ($DeviceAuth -and $Action -ne 'login') -or ($NoOpen -and $Action -ne 'start')) { Write-Error 'Flag does not match action.'; exit 2 }
    $extra = @()
    if ($Repair) { $extra += '--repair' }
    if ($DeviceAuth) { $extra += '--device-auth' }
    if ($NoOpen) { $extra += '--no-open' }
    try { $code = Invoke-Sapling $Action $extra; exit $code } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
}
if ($Repair -or $DeviceAuth -or $NoOpen) { Write-Error 'Specify -Action with flags.'; exit 2 }
if (!$PSBoundParameters.ContainsKey('Lang')) { if (!(Choose-Language)) { exit 0 } }
while ($true) {
    Write-Host "`nSaplingagent"
    Say '  1. Install / update' '  1. 安装 / 更新'
    Say '  2. Configure AI' '  2. 配置 AI 接口'
    Say '  3. Start app' '  3. 启动应用'
    Say '  4. Diagnostics' '  4. 服务诊断'
    Say '  9. Change language' '  9. 切换语言'
    Say '  0. Quit' '  0. 退出'
    $choice = Read-Choice 'Choose / 请选择 [0-4, 9]'
    switch ($choice) {
        '0' { exit 0 }
        '1' { Run-MenuAction 'install' }
        '2' {
            while ($true) {
                Say "`nConfigure AI`n  1. Codex - sign in with your own account`n  2. OpenCode - provider / API key`n  0. Back" "`n配置 AI 接口`n  1. Codex — 登录自己的账号`n  2. OpenCode — 服务商 / API 密钥`n  0. 返回"
                $provider = Read-Choice 'Choose / 请选择 [0-2]'
                if ($provider -eq '0') { break }
                if ($provider -eq '1') { Run-MenuAction 'login'; break }
                if ($provider -eq '2') { Run-MenuAction 'opencode'; break }
                Say 'Please enter 0, 1 or 2.' '请输入 0、1 或 2。'
            }
        }
        '3' { Run-MenuAction 'start' }
        '4' { Run-MenuAction 'doctor' }
        '9' { if (!(Choose-Language)) { exit 0 } }
        default { Say 'Please enter 0, 1, 2, 3, 4 or 9.' '请输入 0、1、2、3、4 或 9。' }
    }
}
