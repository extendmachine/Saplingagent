#!/bin/bash
set -euo pipefail
SAPLING_WINDOWS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
source "$SAPLING_WINDOWS_ROOT/kernel/localization/installer-messages.sh"
SAPLING_WINDOWS_ACTION="${1:-}"
if [ "$#" -gt 0 ]; then shift; fi
SAPLING_WINDOWS_FLAG="${1:-}"
SAPLING_WINDOWS_SECOND_FLAG="${2:-}"
case "$SAPLING_WINDOWS_ACTION:$#:$SAPLING_WINDOWS_FLAG" in
  install:0:|login:0:|configure:0:|opencode:0:|start:0:|doctor:0:|logout:0:|install:1:--repair|login:1:--device-auth|start:1:--no-open|configure:1:--no-open) ;;
  kernel:0:|kernel:1:status|kernel:1:check|kernel:1:update) ;;
  kernel:2:update) [ "$SAPLING_WINDOWS_SECOND_FLAG" = --accept-risk ] || exit 2 ;;
  kernel:2:restore) [[ "$SAPLING_WINDOWS_SECOND_FLAG" =~ ^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$ ]] || exit 2 ;;
  *) sapling_message installer_030 >&2; exit 2 ;;
esac
for SAPLING_WINDOWS_TOOL in cygpath powershell.exe iconv base64; do
  if ! command -v "$SAPLING_WINDOWS_TOOL" >/dev/null 2>&1; then
    sapling_message installer_031 >&2
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
SAPLING_WINDOWS_PROGRAM="$(cat "$SAPLING_WINDOWS_ROOT/kernel/scripts/windows/bootstrap.ps1")"
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
      sapling_message installer_032
      exec winpty powershell.exe -NoLogo -NoProfile -EncodedCommand "$SAPLING_WINDOWS_ENCODED"
    fi ;;
esac
sapling_message installer_033
exec powershell.exe -NoLogo -NoProfile -EncodedCommand "$SAPLING_WINDOWS_ENCODED"
