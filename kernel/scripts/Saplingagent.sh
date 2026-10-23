#!/bin/bash
set -uo pipefail
SAPLING_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
# The setup helper may rename the project after this script opens its webpage.
# Keep our own shell outside that directory so it does not retain a Windows cwd lock.
cd "$(dirname "$SAPLING_ROOT")" || exit 1
SAPLING_BOOTSTRAP=''
SAPLING_CHILD_PID=''
SAPLING_LANG_CHOSEN=0
# Resolve project preference without requiring Node on a first install.
# Only explicit choices are persisted after the local runtime is available.
SAPLING_LANG_EXPLICIT="${SAPLING_LANG_EXPLICIT:-0}"
SAPLING_LANG_HINT="${SAPLING_LANG:-}"
SAPLING_LANG=''
if [ "$SAPLING_LANG_EXPLICIT" = 1 ] && [ -n "$SAPLING_LANG_HINT" ]; then SAPLING_LANG="$SAPLING_LANG_HINT"; SAPLING_LANG_CHOSEN=1;
elif [ -f "$SAPLING_ROOT/config/ui-language.json" ] && [ ! -L "$SAPLING_ROOT/config" ] && [ ! -L "$SAPLING_ROOT/config/ui-language.json" ]; then
  SAPLING_PREFERENCE="$(head -c 4096 "$SAPLING_ROOT/config/ui-language.json")"
  SAPLING_LANGUAGE_PATTERN='"language"[[:space:]]*:[[:space:]]*"(en|zh)"'
  SAPLING_SCHEMA_PATTERN='"schemaVersion"[[:space:]]*:[[:space:]]*1([[:space:],}])'
  if [[ "$SAPLING_PREFERENCE" =~ $SAPLING_SCHEMA_PATTERN ]] && [[ "$SAPLING_PREFERENCE" =~ $SAPLING_LANGUAGE_PATTERN ]]; then SAPLING_LANG="${BASH_REMATCH[1]}"; SAPLING_LANG_CHOSEN=1; fi
fi
if [ -z "${SAPLING_LANG:-}" ]; then
  SAPLING_LOCALE="${SAPLING_LANG_HINT:-${LC_ALL:-${LANG:-${LANGUAGE:-}}}}"
  if [ -z "$SAPLING_LOCALE" ] && [ "$(uname -s)" = Darwin ]; then SAPLING_LOCALE="$(/usr/bin/defaults read -g AppleLanguages 2>/dev/null || true)"; fi
  case "$SAPLING_LOCALE" in zh*|*'"zh-'*|*' zh-'*) SAPLING_LANG=zh ;; *) SAPLING_LANG=en ;; esac
fi
if [ "${1:-}" = '--lang' ]; then
  if [ "$#" -lt 2 ]; then printf '%s\n' 'Usage / 用法: bash Saplingagent.sh --lang en|zh [action]' >&2; exit 2; fi
  SAPLING_LANG="$2"
  SAPLING_LANG_CHOSEN=1
  SAPLING_LANG_EXPLICIT=1
  shift 2
fi
case "$SAPLING_LANG" in
  en|zh) ;;
  *) printf '%s\n' 'Language must be en or zh / 语言必须是 en 或 zh。' >&2; exit 2 ;;
esac
export SAPLING_LANG SAPLING_LANG_EXPLICIT
source "$SAPLING_ROOT/kernel/localization/installer-messages.sh"


usage() {
  sapling_message installer_001
  sapling_message installer_002
}

select_bootstrap() {
  case "$(uname -s)" in
    Darwin) SAPLING_BOOTSTRAP="$SAPLING_ROOT/kernel/scripts/macos/bootstrap.sh" ;;
    MINGW*|MSYS*|CYGWIN*) SAPLING_BOOTSTRAP="$SAPLING_ROOT/kernel/scripts/windows/bootstrap.sh" ;;
    *) sapling_message installer_003 >&2; return 1 ;;
  esac
}

# Explicit actions skip the menu and preserve bootstrap exit status.
if [ "$#" -gt 0 ]; then
  case "$1" in
    -h|--help) usage; exit 0 ;;
    install|login|configure|opencode|start|doctor|logout|kernel) select_bootstrap || exit 1; exec /bin/bash "$SAPLING_BOOTSTRAP" "$@" ;;
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
    if [ "$SAPLING_LANG" = zh ]; then printf 'Choose / 请选择 [1-2, Enter=中文]: '; else printf 'Choose / 请选择 [1-2, Enter=English]: '; fi
    if ! IFS= read -r choice; then return 1; fi
    case "$choice" in
      '') SAPLING_LANG_EXPLICIT=1; export SAPLING_LANG SAPLING_LANG_EXPLICIT; return 0 ;;
      1) SAPLING_LANG=en; SAPLING_LANG_EXPLICIT=1; export SAPLING_LANG SAPLING_LANG_EXPLICIT; return 0 ;;
      2) SAPLING_LANG=zh; SAPLING_LANG_EXPLICIT=1; export SAPLING_LANG SAPLING_LANG_EXPLICIT; return 0 ;;
      0) return 1 ;;
      *) printf '%s\n' 'Please enter 0, 1 or 2 / 请输入 0、1 或 2。' ;;
    esac
  done
}
run_action() {
  if ! select_bootstrap; then return 0; fi
  if [ "${1:-}" = install ]; then sapling_message installer_004; fi
  local result
  if [ "$SAPLING_BOOTSTRAP" = "$SAPLING_ROOT/kernel/scripts/windows/bootstrap.sh" ]; then
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
  SAPLING_ACTION_STATUS="$result"
  if [ "${result}" -ne 0 ]; then
    printf '\n'
    sapling_message installer_005
  elif [ "${1:-}" = install ]; then
    sapling_message installer_006
  fi
  return 0
}

if [ "$SAPLING_LANG_CHOSEN" -eq 0 ]; then choose_language || exit 0; fi
if [ -f "$SAPLING_ROOT/kernel/launcher/entry.mjs" ] && [ "${SAPLING_LEGACY_MENU:-0}" != 1 ]; then
  run_action install
  exit "${SAPLING_ACTION_STATUS:-1}"
fi
while true; do
  printf '\n%s\n' 'Saplingagent'
  SAPLING_KERNEL_VERSION=''
  if [ -f "$SAPLING_ROOT/kernel/manifest.json" ]; then
    SAPLING_RELEASE_TEXT="$(cat "$SAPLING_ROOT/kernel/manifest.json")"
    SAPLING_VERSION_PATTERN='"version"[[:space:]]*:[[:space:]]*"([0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?)"'
    if [[ "$SAPLING_RELEASE_TEXT" =~ $SAPLING_VERSION_PATTERN ]]; then SAPLING_KERNEL_VERSION="${BASH_REMATCH[1]}"; fi
  fi
  if [ -n "$SAPLING_KERNEL_VERSION" ]; then sapling_message installer_007;
  else sapling_message installer_008; fi
  sapling_message installer_009
  sapling_message installer_010
  sapling_message installer_011
  sapling_message installer_012
  sapling_message installer_013
  sapling_message installer_014
  sapling_message installer_015
  if [ "$SAPLING_LANG" = 'zh' ]; then printf '请选择 [0-4, 6, 9]: '; else printf 'Choose [0-4, 6, 9]: '; fi
  if ! IFS= read -r choice; then printf '\n'; exit 0; fi
  case "$choice" in
    1) run_action install; if [ "${SAPLING_ACTION_STATUS:-1}" -eq 0 ] && [ -f "$SAPLING_ROOT/kernel/launcher/entry.mjs" ]; then exit 0; fi ;;
    2) run_action configure; if [ "${SAPLING_ACTION_STATUS:-1}" -eq 0 ] && [ -f "$SAPLING_ROOT/kernel/launcher/entry.mjs" ]; then exit 0; fi ;;
    3) run_action start ;;
    4) run_action doctor ;;
    6) run_action kernel ;;
    9) choose_language || exit 0 ;;
    0) exit 0 ;;
    *) sapling_message installer_016 ;;
  esac
done
