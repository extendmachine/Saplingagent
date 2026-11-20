#!/bin/bash
# The GNU/Linux headless launcher reuses or installs the device-specific Node/npm distribution.
set -euo pipefail
project="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
source "$project/kernel/localization/installer-messages.sh"
machine="$(uname -m 2>/dev/null || true)"
case "$machine" in x86_64|amd64|aarch64|arm64) ;; *) machine="$(dpkg --print-architecture 2>/dev/null || arch 2>/dev/null || true)" ;; esac
case "$machine" in x86_64|amd64) arch=x64 ;; aarch64|arm64) arch=arm64 ;; *) sapling_message linux_device >&2; exit 1 ;; esac
version="$(sed -n 's/.*"nodeVersion":[[:space:]]*"\([0-9.]*\)".*/\1/p' "$project/kernel/config/linux.json")"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 1
runtime="$project/.runtime"
alias_dir="$runtime/node-v$version-linux-$arch"
[ ! -L "$runtime" ] || { sapling_message linux_runtime >&2; exit 1; }
mkdir -p "$runtime"
# Keep competing starts of this project from racing the local alias/portable copy.
command -v flock >/dev/null || { sapling_message linux_flock >&2; exit 1; }
[ ! -L "$runtime/linux-node.flock" ] || { sapling_message linux_runtime >&2; exit 1; }
exec 9>>"$runtime/linux-node.flock"
flock -w 120 9 || { sapling_message linux_busy >&2; exit 1; }
library="${SAPLING_RUNTIME_HOME:-$HOME/.local/share/Saplingagent}"
case "$library" in /*) ;; *) sapling_message shared_location >&2; exit 1 ;; esac
shared_node="$library/runtimes/node-v$version-linux-$arch"
source "$project/kernel/scripts/linux/node-download.sh"
mode="${SAPLING_RUNTIME_MODE:-}"
if [ -z "$mode" ] && [ -f "$runtime/runtime-mode" ]; then mode="$(cat "$runtime/runtime-mode")"; fi
mode="${mode:-shared}"
case "$mode" in portable|shared) ;; *) sapling_message shared_mode >&2; exit 1 ;; esac
candidate=''
for binary in "$(command -v node || true)" "$shared_node/bin/node" "$shared_node"-gen-*/bin/node "$alias_dir/bin/node"; do
  if linux_node_usable "$binary"; then
    if [ "$mode" = shared ]; then
      case "$(readlink -f -- "$binary")" in "$runtime/tool-store/"*) continue ;; esac
    fi
    candidate="$binary"; break
  fi
done
if [ -z "$candidate" ]; then
  case "${1:-}" in
    install|runtime-only)
      install_home="$library"
      if [ "$mode" = portable ]; then
        install_home="$runtime/tool-store"
        for dir in "$install_home" "$install_home/runtimes" "$install_home/locks"; do
          [ ! -L "$dir" ] || { sapling_message linux_runtime >&2; exit 1; }
        done
      fi
      candidate="$(linux_install_node "$install_home")"
      ;;
    *) sapling_message linux_node >&2; exit 1 ;;
  esac
fi
"$candidate" "$project/kernel/scripts/linux/node.mjs" "$project" "$version"
exec 9>&-
if [ "${1:-}" = runtime-only ]; then exit 0; fi
export SEED_ROOT="$project" SEED_IMPORT_EXISTING_AUTH=0 PATH="$alias_dir/bin:$PATH"
cd "$project"
exec "$alias_dir/bin/node" "$project/kernel/scripts/launcher/cli.mjs" "$@"
