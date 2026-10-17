#!/bin/bash
set -uo pipefail
SAPLING_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SAPLING_BOOTSTRAP=''
SAPLING_CHILD_PID=''
SAPLING_LANG_CHOSEN=0
SAPLING_LANG="${SAPLING_LANG:-en}"
if [ "${1:-}" = '--lang' ]; then
  if [ "$#" -lt 2 ]; then printf '%s\n' 'Usage / 用法: bash Saplingagent.sh --lang en|zh [action]' >&2; exit 2; fi
  SAPLING_LANG="$2"
  SAPLING_LANG_CHOSEN=1
  shift 2
fi
case "$SAPLING_LANG" in
  en|zh) ;;
  *) printf '%s\n' 'Language must be en or zh / 语言必须是 en 或 zh。' >&2; exit 2 ;;
esac
export SAPLING_LANG

say() {
  if [ "$SAPLING_LANG" = 'zh' ]; then printf '%s\n' "$2"; else printf '%s\n' "$1"; fi
}

# Read only this independent folder's saved choice, without Node/bootstrap.
# A linked worktree must not inherit and reinterpret shared maintainer settings.
storage_mode() (
  [ -d "$SAPLING_ROOT/.git" ] && [ ! -L "$SAPLING_ROOT/.git" ] || return 0
  command -v git >/dev/null 2>&1 || return 0
  local variable
  for variable in ${!GIT_@}; do unset "$variable"; done
  git -C "$SAPLING_ROOT" config --local --get saplingagent.storageMode 2>/dev/null || true
)
usage() {
  say 'Usage: bash Saplingagent.sh [--lang en|zh] [install [--repair] | login [--device-auth] | configure [--no-open] | opencode | start [--no-open] | doctor | logout | git | kernel [status|check|update [--accept-risk]|restore ID]]' '用法：bash Saplingagent.sh [--lang en|zh] [install [--repair] | login [--device-auth] | configure [--no-open] | opencode | start [--no-open] | doctor | logout | git | kernel [status|check|update [--accept-risk]|restore ID]]'
  say 'Run without arguments to choose a language and open the interactive menu.' '不带参数运行即可选择语言并进入交互菜单。'
}

select_bootstrap() {
  case "$(uname -s)" in
    Darwin) SAPLING_BOOTSTRAP="$SAPLING_ROOT/scripts/macos/bootstrap.sh" ;;
    MINGW*|MSYS*|CYGWIN*) SAPLING_BOOTSTRAP="$SAPLING_ROOT/scripts/windows/bootstrap.sh" ;;
    *) say 'Unsupported OS. Use macOS Terminal or Windows Git Bash; WSL/Linux installation is not supported.' '当前系统不支持安装。请使用 macOS 终端或 Windows Git Bash；暂不支持 WSL / Linux。' >&2; return 1 ;;
  esac
}

# Explicit actions skip the menu and preserve bootstrap exit status.
if [ "$#" -gt 0 ]; then
  case "$1" in
    -h|--help) usage; exit 0 ;;
    install|login|configure|opencode|start|doctor|logout|git|kernel) select_bootstrap || exit 1; exec /bin/bash "$SAPLING_BOOTSTRAP" "$@" ;;
    *) usage >&2; exit 2 ;;
  esac
fi

stop_action() {
  if [ -n "$SAPLING_CHILD_PID" ]; then
    kill -s "$1" "$SAPLING_CHILD_PID" 2>/dev/null || true
    wait "$SAPLING_CHILD_PID" 2>/dev/null || true
  fi
  exit "$2"
}
trap 'stop_action INT 130' INT
trap 'stop_action TERM 143' TERM
trap 'stop_action HUP 129' HUP

choose_language() {
  while true; do
    printf '\n'
    printf '%s\n' 'Language / 语言' '  1. English' '  2. 中文' '  0. Quit / 退出'
    printf 'Choose / 请选择 [1-2, Enter=English]: '
    if ! IFS= read -r choice; then return 1; fi
    case "$choice" in
      ''|1) SAPLING_LANG=en; export SAPLING_LANG; return 0 ;;
      2) SAPLING_LANG=zh; export SAPLING_LANG; return 0 ;;
      0) return 1 ;;
      *) printf '%s\n' 'Please enter 0, 1 or 2 / 请输入 0、1 或 2。' ;;
    esac
  done
}
run_action() {
  if ! select_bootstrap; then return 0; fi
  if [ "${1:-}" = install ]; then say 'Starting install / update. Please wait for the result below…' '正在启动安装 / 更新，请查看下方执行结果…'; fi
  local result
  if [ "$SAPLING_BOOTSTRAP" = "$SAPLING_ROOT/scripts/windows/bootstrap.sh" ]; then
    # A native console bridge must own the foreground terminal. Backgrounding
    # winpty can stop it with SIGTTOU before PowerShell or device detection runs.
    /bin/bash "$SAPLING_BOOTSTRAP" "$@" <&0
    result=$?
  else
    /bin/bash "$SAPLING_BOOTSTRAP" "$@" <&0 &
    SAPLING_CHILD_PID=$!
    wait "$SAPLING_CHILD_PID"
    result=$?
    SAPLING_CHILD_PID=''
  fi
  if [ "${result}" -ne 0 ]; then
    printf '\n'
    say "Operation incomplete (exit ${result}). You can retry or choose Diagnostics." "操作未完成（退出码 ${result}）。可以重试或选择服务诊断。"
  elif [ "${1:-}" = install ]; then
    say 'Install / update finished. Source and dependency results are shown above.' '安装 / 更新执行完成。源码和依赖结果见上方。'
  fi
  return 0
}

if [ "$SAPLING_LANG_CHOSEN" -eq 0 ]; then choose_language || exit 0; fi
while true; do
  SAPLING_STORAGE_MODE="$(storage_mode)"
  SAPLING_INDEPENDENT=0
  case "$SAPLING_STORAGE_MODE" in local|own) SAPLING_INDEPENDENT=1 ;; esac
  printf '\n%s\n' 'Saplingagent'
  SAPLING_PRODUCT_VERSION=''
  if [ -f "$SAPLING_ROOT/config/release.json" ]; then
    SAPLING_RELEASE_TEXT="$(cat "$SAPLING_ROOT/config/release.json")"
    SAPLING_VERSION_PATTERN='"version"[[:space:]]*:[[:space:]]*"([0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?)"'
    if [[ "$SAPLING_RELEASE_TEXT" =~ $SAPLING_VERSION_PATTERN ]]; then SAPLING_PRODUCT_VERSION="${BASH_REMATCH[1]}"; fi
  fi
  if [ -n "$SAPLING_PRODUCT_VERSION" ]; then say "  Release: $SAPLING_PRODUCT_VERSION" "  发布版本：$SAPLING_PRODUCT_VERSION";
  else say '  Release: unavailable' '  发布版本：不可用'; fi
  if [ "$SAPLING_INDEPENDENT" -eq 0 ]; then
    say '  1. Install / update' '  1. 安装 / 更新'
  elif [ "$SAPLING_STORAGE_MODE" = local ]; then
    say '  Storage: local Git; independent of Saplingagent upstream.' '  存放方式：本地 Git；独立于 Saplingagent 上游。'
  else
    say '  Storage: your repository; independent of Saplingagent upstream.' '  存放方式：自己的仓库；独立于 Saplingagent 上游。'
  fi
  say '  2. Configure AI' '  2. 配置 AI 接口'
  say '  3. Start app' '  3. 启动应用'
  say '  4. Diagnostics' '  4. 服务诊断'
  say '  5. Git / storage setup' '  5. Git / 存放配置'
  say '  6. Kernel management' '  6. 内核管理'
  say '  9. Change language' '  9. 切换语言'
  say '  0. Quit' '  0. 退出'
  if [ "$SAPLING_INDEPENDENT" -eq 1 ]; then
    if [ "$SAPLING_LANG" = 'zh' ]; then printf '请选择 [0, 2-6, 9]: '; else printf 'Choose [0, 2-6, 9]: '; fi
  else
    if [ "$SAPLING_LANG" = 'zh' ]; then printf '请选择 [0-6, 9]: '; else printf 'Choose [0-6, 9]: '; fi
  fi
  if ! IFS= read -r choice; then printf '\n'; exit 0; fi
  case "$choice" in
    1)
      if [ "$SAPLING_INDEPENDENT" -eq 0 ]; then run_action install
      else say 'This application uses independent storage. For dependency repair, run: bash Saplingagent.sh install --repair' '此应用使用独立存放方式。需要修复依赖时运行：bash Saplingagent.sh install --repair'
      fi ;;
    2) run_action configure ;;
    3) run_action start ;;
    4) run_action doctor ;;
    5) run_action git ;;
    6) run_action kernel ;;
    9) choose_language || exit 0 ;;
    0) exit 0 ;;
    *)
      if [ "$SAPLING_INDEPENDENT" -eq 1 ]; then say 'Please enter 0, 2, 3, 4, 5, 6 or 9.' '请输入 0、2、3、4、5、6 或 9。'
      else say 'Please enter 0, 1, 2, 3, 4, 5, 6 or 9.' '请输入 0、1、2、3、4、5、6 或 9。'
      fi ;;
  esac
done
