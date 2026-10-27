# Pre-Node PowerShell vocabulary; keep technical IDs and filesystem paths unchanged.
$SaplingInstallerMessages = @{
    'unsupported_arch' = @{ en = 'Unsupported device architecture: {0}. A 64-bit Windows x64 or ARM64 system is required.'; zh = '不支持设备架构：{0}。需要 64 位 Windows x64 或 ARM64 系统。' }
    'detected_device' = @{ en = 'Detected device: Windows {0}, {1}. Selecting matching project runtime.'; zh = '检测到设备：Windows {0}，{1}。自动选择对应项目运行环境。' }
    'windows_003' = @{ en = 'Project storage must use ordinary local directories.'; zh = '项目存储必须使用普通的本地目录。' }
    'windows_004' = @{ en = 'Windows bootstrap ready. Checking this device...'; zh = 'Windows 安装器已启动，正在检查设备…' }
    'windows_005' = @{ en = 'Detected a non-Windows system. On macOS run bash Saplingagent.sh.'; zh = '检测到非 Windows 系统，macOS 请运行 bash Saplingagent.sh。' }
    'windows_006' = @{ en = 'Windows 10 version 1809 or later is required. Update Windows before installation.'; zh = '请先更新到 Windows 10 1809 或更新版本。' }
    'windows_007' = @{ en = 'Invalid Windows runtime configuration.'; zh = 'Windows 运行环境配置无效。请恢复完整内核文件后重试。' }
    'windows_008' = @{ en = 'Project Node is damaged. Stop the app, remove only its .runtime/node-v*-win-<detected-architecture> folder, then install again.'; zh = '项目 Node 已损坏。请先停止应用，仅删除对应 .runtime/node-v*-win-<detected-architecture> 文件夹，然后重新安装。' }
    'windows_009' = @{ en = 'Install first. No runtime will be downloaded by this action.'; zh = '请先选择安装。此操作不会下载运行环境。' }
    'windows_010' = @{ en = 'Another Node installation is running. See the Windows guide before removing a stale lock.'; zh = '另一个 Node 安装任务正在运行。请等待其完成；删除遗留锁前请查看 Windows 指南。' }
    'windows_011' = @{ en = 'Finish the active kernel/start/setup operation before installing Node.'; zh = '请先完成正在进行的内核维护、启动或配置操作，然后再安装 Node。' }
    'windows_012' = @{ en = 'Downloading project-local Node from nodejs.org...'; zh = '正在从 nodejs.org 下载项目内 Node…' }
    'windows_013' = @{ en = 'Node SHA-256 mismatch. Installation stopped.'; zh = 'Node SHA-256 校验失败，安装已停止。' }
    'windows_014' = @{ en = 'Downloaded Node cannot run on this computer.'; zh = '下载的 Node 无法在此电脑运行。' }
    'windows_015' = @{ en = 'Downloaded Node architecture does not match this device.'; zh = '下载的 Node 架构与此设备不匹配。' }
}
function Message([string]$Key) {
    $language = if ($script:SaplingLanguage -eq 'zh') { 'zh' } else { 'en' }
    if ($SaplingInstallerMessages.ContainsKey($Key)) { return $SaplingInstallerMessages[$Key][$language] }
    return $Key
}
