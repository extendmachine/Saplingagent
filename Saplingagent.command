#!/bin/bash
set -uo pipefail
SAPLING_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SAPLING_BOOTSTRAP="$SAPLING_ROOT/scripts/macos/bootstrap.sh"
SAPLING_CHILD_PID=''

usage() {
  printf '%s\n' 'Usage: bash Saplingagent.command [install [--repair] | login [--device-auth] | opencode | start [--no-open] | doctor | logout]' 'Run without arguments for the interactive menu.'
}

# Keep explicit actions available for automation and recovery.
if [ "$#" -gt 0 ]; then
  case "$1" in
    -h|--help) usage; exit 0 ;;
    install|login|opencode|start|doctor|logout) exec /bin/bash "$SAPLING_BOOTSTRAP" "$@" ;;
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

run_action() {
  /bin/bash "$SAPLING_BOOTSTRAP" "$@" <&0 &
  SAPLING_CHILD_PID=$!
  wait "$SAPLING_CHILD_PID"
  local result=$?
  SAPLING_CHILD_PID=''
  if [ "$result" -ne 0 ]; then
    printf '\nOperation incomplete (exit %s). You can retry or choose Diagnostics.\n' "$result"
  fi
  return 0
}

configure() {
  while true; do
    printf '\n'
    printf '%s\n' 'Configure AI' '  1. Codex - sign in with your own account' '  2. OpenCode - configure a provider / API key' '  0. Back'
    printf 'Choose [0-2]: '
    if ! IFS= read -r choice; then return 1; fi
    case "$choice" in
      1) run_action login; return 0 ;;
      2) run_action opencode; return 0 ;;
      0) return 0 ;;
      *) printf '%s\n' 'Please enter 0, 1 or 2.' ;;
    esac
  done
}

while true; do
  printf '\n'
  printf '%s\n' 'Saplingagent' '  1. Install / update' '  2. Configure AI' '  3. Start app' '  4. Diagnostics' '  0. Quit'
  printf 'Choose [0-4]: '
  if ! IFS= read -r choice; then printf '\n'; exit 0; fi
  case "$choice" in
    1) run_action install ;;
    2) configure || exit 0 ;;
    3) run_action start ;;
    4) run_action doctor ;;
    0) exit 0 ;;
    *) printf '%s\n' 'Please enter a number from 0 to 4.' ;;
  esac
done
