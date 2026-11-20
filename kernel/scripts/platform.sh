#!/bin/bash
# Bash 3.2+, also sourced from the verified source archive by install.sh.
# The selected target is inherited by the bootstrap and its children.
sapling_select_platform() {
  local request="${1-}" system
  SAPLING_PLATFORM_FALLBACK=0
  case "$request" in
    auto)
      system="$(uname -s 2>/dev/null)" || system=''
      case "$system" in
        Darwin) SAPLING_PLATFORM=macos ;;
        Linux) SAPLING_PLATFORM=linux ;;
        MINGW*|MSYS*|CYGWIN*) SAPLING_PLATFORM=windows ;;
        *) SAPLING_PLATFORM=linux; SAPLING_PLATFORM_FALLBACK=1 ;;
      esac ;;
    macos|linux|windows) SAPLING_PLATFORM="$request" ;;
    *) return 2 ;;
  esac
  export SAPLING_PLATFORM
}

# Call only during an interactive installation with no explicit target. The
# downloader supplies the real terminal on stdin. Diagnostics go to stderr.
sapling_prompt_platform() {
  local answer
  if [ "${SAPLING_LANG:-en}" = zh ]; then
    printf '\n安装环境（回车使用 %s）\n' "$SAPLING_PLATFORM" >&2
    printf '%s\n' '  1. macOS（MacBook）' '  2. GNU/Linux' '  3. Windows（Git Bash）' '  0. 退出' >&2
  else
    printf '\nInstallation platform (Enter for %s)\n' "$SAPLING_PLATFORM" >&2
    printf '%s\n' '  1. macOS (MacBook)' '  2. GNU/Linux' '  3. Windows (Git Bash)' '  0. Quit' >&2
  fi
  while :; do
    printf '[1-3, 0]: ' >&2
    IFS= read -r answer || return 130
    case "$answer" in
      '') return 0 ;;
      1) sapling_select_platform macos; return ;;
      2) sapling_select_platform linux; return ;;
      3) sapling_select_platform windows; return ;;
      0) return 130 ;;
      *) if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' '请选择 1、2、3、0 或回车。' >&2; else printf '%s\n' 'Choose 1, 2, 3, 0, or Enter.' >&2; fi ;;
    esac
  done
}
