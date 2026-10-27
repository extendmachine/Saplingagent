#!/bin/bash
# Pre-Node installer vocabulary. No external programs, writes or global state.
sapling_message() {
  case "$1" in
    installer_001) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '用法：bash Saplingagent.sh [--lang en|zh] [install [--repair] | login [--device-auth] | configure [--no-open] | opencode | start [--no-open] | doctor | logout | kernel [status|check|update [--accept-risk]|restore ID]]'; else printf '%s\n' 'Usage: bash Saplingagent.sh [--lang en|zh] [install [--repair] | login [--device-auth] | configure [--no-open] | opencode | start [--no-open] | doctor | logout | kernel [status|check|update [--accept-risk]|restore ID]]'; fi ;;
    installer_002) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '不带参数运行即可选择语言并进入交互菜单。'; else printf '%s\n' 'Run without arguments to choose a language and open the interactive menu.'; fi ;;
    installer_003) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '当前系统不支持安装。请使用 macOS 终端或 Windows Git Bash；暂不支持 WSL / Linux。'; else printf '%s\n' 'Unsupported OS. Use macOS Terminal or Windows Git Bash; WSL/Linux installation is not supported.'; fi ;;
    installer_004) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '正在启动安装 / 修复，请查看下方执行结果…'; else printf '%s\n' 'Starting install / repair. Please wait for the result below…'; fi ;;
    installer_005) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "操作未完成（退出码 ${result}）。可以重试或选择服务诊断。"; else printf '%s\n' "Operation incomplete (exit ${result}). You can retry or choose Diagnostics."; fi ;;
    installer_006) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '安装 / 修复执行完成，应用源码与 Git 保留。'; else printf '%s\n' 'Install / repair finished. Application source and Git are preserved.'; fi ;;
    installer_007) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "  内核版本：$SAPLING_KERNEL_VERSION"; else printf '%s\n' "  Kernel version: $SAPLING_KERNEL_VERSION"; fi ;;
    installer_008) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '  内核版本：不可用'; else printf '%s\n' '  Kernel version: unavailable'; fi ;;
    installer_009) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '  1. 安装 / 修复依赖'; else printf '%s\n' '  1. Install / repair dependencies'; fi ;;
    installer_010) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '  2. 配置 AI 接口'; else printf '%s\n' '  2. Configure AI'; fi ;;
    installer_011) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '  3. 启动应用'; else printf '%s\n' '  3. Start app'; fi ;;
    installer_012) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '  4. 服务诊断'; else printf '%s\n' '  4. Diagnostics'; fi ;;
    installer_013) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '  6. 内核管理'; else printf '%s\n' '  6. Kernel management'; fi ;;
    installer_014) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '  9. 切换语言'; else printf '%s\n' '  9. Change language'; fi ;;
    installer_015) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '  0. 退出'; else printf '%s\n' '  0. Quit'; fi ;;
    installer_016) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '请输入 0、1、2、3、4、6 或 9。'; else printf '%s\n' 'Please enter 0, 1, 2, 3, 4, 6 or 9.'; fi ;;
    installer_017) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '项目存储必须使用普通的本地目录。'; else printf '%s\n' 'Project storage must use ordinary local directories.'; fi ;;
    installer_018) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "可用操作：install / login / start / doctor / logout / configure / opencode / kernel。"; else printf '%s\n' "Available actions: install / login / start / doctor / logout / configure / opencode / kernel."; fi ;;
    installer_019) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "此安装程序目前仅支持 macOS。"; else printf '%s\n' "This installer currently supports macOS only."; fi ;;
    installer_020) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "需要 macOS 13.5 或更高版本；当前版本：${SEED_OS_VERSION}。"; else printf '%s\n' "macOS 13.5 or later is required; current version: ${SEED_OS_VERSION}."; fi ;;
    installer_021) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "不支持的 Mac 架构：${SEED_MAC_ARCH}"; else printf '%s\n' "Unsupported Mac architecture:${SEED_MAC_ARCH}"; fi ;;
    installer_022) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "检测到设备：macOS ${SEED_OS_VERSION}，${SEED_MAC_ARCH}。自动选择对应项目运行环境。"; else printf '%s\n' "Detected device: macOS ${SEED_OS_VERSION}, ${SEED_MAC_ARCH}. Selecting matching project runtime."; fi ;;
    installer_023) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "kernel/config/macos.json 中的 Node 版本无效。"; else printf '%s\n' "Invalid Node version in kernel/config/macos.json."; fi ;;
    installer_024) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "项目内 Node 未安装或版本不符。请运行 bash Saplingagent.sh，先选择安装 / 更新。"; else printf '%s\n' "Project-local Node is not installed or has a different version. Open Saplingagent.sh and choose Install / update first."; fi ;;
    installer_025) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "另一个 Node 安装正在进行。请稍后重试；确认其窗口已关闭后，按文档清理 .runtime/node-install.lock。"; else printf '%s\n' "Another Node installation is in progress. Retry later; if its window has closed, remove .runtime/node-install.lock as documented."; fi ;;
    installer_026) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '请先完成正在进行的内核／启动操作，再安装 Node。'; else printf '%s\n' 'Finish the active kernel/start operation before installing Node.'; fi ;;
    installer_027) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "正在从 Node.js 官方网站安装项目内 Node ${SEED_NODE_VERSION}（${SEED_MAC_ARCH}）…"; else printf '%s\n' "Installing project-local Node ${SEED_NODE_VERSION} (${SEED_MAC_ARCH}) from the official Node.js website…"; fi ;;
    installer_028) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "官方校验清单中没有所需 Node 文件，本次未安装。"; else printf '%s\n' "The official checksum list does not contain the requested Node file; nothing was installed."; fi ;;
    installer_029) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '下载的 Node 架构与当前设备不匹配。'; else printf '%s\n' 'Downloaded Node architecture does not match this device.'; fi ;;
    installer_030) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '操作或参数无效。请运行 bash Saplingagent.sh --help。'; else printf '%s\n' 'Invalid action/flag. Run bash Saplingagent.sh --help.'; fi ;;
    installer_031) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "缺少 $SAPLING_WINDOWS_TOOL。请使用 https://gitforwindows.org/ 提供的 Git Bash。"; else printf '%s\n' "Missing $SAPLING_WINDOWS_TOOL. Use Git Bash from https://gitforwindows.org/."; fi ;;
    installer_032) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "正在启动 Windows ${SAPLING_WINDOWS_ACTION}（PowerShell / winpty）…"; else printf '%s\n' "Starting Windows $SAPLING_WINDOWS_ACTION (PowerShell / winpty)..."; fi ;;
    installer_033) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "正在启动 Windows ${SAPLING_WINDOWS_ACTION}（PowerShell）…"; else printf '%s\n' "Starting Windows $SAPLING_WINDOWS_ACTION (PowerShell)..."; fi ;;
    *) printf '%s\n' "$1" ;;
  esac
}
