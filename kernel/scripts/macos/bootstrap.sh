#!/bin/bash
set -euo pipefail


SEED_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
source "$SEED_PROJECT_DIR/kernel/localization/installer-messages.sh"
# Bind installer/tool scratch space before running curl, tar or Node.
for SAPLING_LOCAL_DIRECTORY in .runtime .runtime/tmp .cache .cache/npm .cache/node-compile .cache/runtime local-secrets local-secrets/runtime local-secrets/runtime/config data data/runtime data/runtime-state; do
  if [ -L "$SEED_PROJECT_DIR/$SAPLING_LOCAL_DIRECTORY" ]; then
    sapling_message installer_017 >&2; exit 1
  fi
  mkdir -p "$SEED_PROJECT_DIR/$SAPLING_LOCAL_DIRECTORY"
done
export TMPDIR="$SEED_PROJECT_DIR/.runtime/tmp"
export TMP="$TMPDIR"
export TEMP="$TMPDIR"
export npm_config_cache="$SEED_PROJECT_DIR/.cache/npm"
export NODE_COMPILE_CACHE="$SEED_PROJECT_DIR/.cache/node-compile"
export XDG_CONFIG_HOME="$SEED_PROJECT_DIR/local-secrets/runtime/config"
export XDG_DATA_HOME="$SEED_PROJECT_DIR/data/runtime"
export XDG_STATE_HOME="$SEED_PROJECT_DIR/data/runtime-state"
export XDG_CACHE_HOME="$SEED_PROJECT_DIR/.cache/runtime"

case "${1:-}" in
  install|login|configure|start|doctor|logout|opencode|kernel|runtime-only) ;;
  *) sapling_message installer_018 >&2; exit 1 ;;
esac
if [ "$(/usr/bin/uname -s)" != "Darwin" ]; then
  sapling_message installer_019 >&2
  exit 1
fi
SEED_OS_VERSION="$(/usr/bin/sw_vers -productVersion)"
SEED_OS_MAJOR="${SEED_OS_VERSION%%.*}"
SEED_OS_REST="${SEED_OS_VERSION#*.}"
SEED_OS_MINOR="${SEED_OS_REST%%.*}"
if [ "$SEED_OS_MAJOR" -lt 13 ] || { [ "$SEED_OS_MAJOR" -eq 13 ] && [ "$SEED_OS_MINOR" -lt 5 ]; }; then
  sapling_message installer_020 >&2
  exit 1
fi
SEED_MAC_ARCH="$(/usr/bin/uname -m)"
# Detect Apple Silicon even when the terminal is running under Rosetta.
if [ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true)" = "1" ]; then SEED_MAC_ARCH="arm64"; fi
case "${SEED_MAC_ARCH}" in
  arm64) ;;
  x86_64) SEED_MAC_ARCH="x64" ;;
  *) sapling_message installer_021 >&2; exit 1 ;;
esac
sapling_message installer_022
SEED_NODE_VERSION="$(/usr/bin/plutil -extract nodeVersion raw -o - "$SEED_PROJECT_DIR/kernel/config/macos.json")"
if ! [[ "${SEED_NODE_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  sapling_message installer_023 >&2
  exit 1
fi
SEED_NODE_DIR="$SEED_PROJECT_DIR/.runtime/node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}"
SEED_NODE_BIN="$SEED_NODE_DIR/bin/node"

if [ ! -x "$SEED_NODE_BIN" ] || [ "$("$SEED_NODE_BIN" --version)" != "v${SEED_NODE_VERSION}" ] || [ "$("$SEED_NODE_BIN" -p 'process.arch')" != "$SEED_MAC_ARCH" ]; then
  if [ "$1" != "install" ] && [ "$1" != "runtime-only" ]; then
    sapling_message installer_024 >&2
    exit 1
  fi
  mkdir -p "$SEED_PROJECT_DIR/.runtime"
  SEED_BOOTSTRAP_LOCK="$SEED_PROJECT_DIR/.runtime/node-install.lock"
  if ! mkdir "$SEED_BOOTSTRAP_LOCK" 2>/dev/null; then
    sapling_message installer_025 >&2
    exit 1
  fi
  if [ -e "$SEED_PROJECT_DIR/.runtime/kernel-operation.lock" ] || [ -e "$SEED_PROJECT_DIR/.runtime/launcher-compile.lock" ] || [ -e "$SEED_PROJECT_DIR/.runtime/project-finalization.json" ]; then
    rmdir "$SEED_BOOTSTRAP_LOCK"
    sapling_message installer_026 >&2
    exit 1
  fi
  SEED_BOOTSTRAP_STAGE=""
  trap 'rm -rf "$SEED_BOOTSTRAP_STAGE"; rmdir "$SEED_BOOTSTRAP_LOCK"' EXIT
  SEED_BOOTSTRAP_STAGE="$(/usr/bin/mktemp -d "$SEED_PROJECT_DIR/.runtime/node-install.XXXXXX")"
  SEED_NODE_ARCHIVE="node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}.tar.gz"
  SEED_NODE_URL="https://nodejs.org/dist/v${SEED_NODE_VERSION}"
  sapling_message installer_027
  /usr/bin/curl --fail --show-error --location --proto '=https' --tlsv1.2 --connect-timeout 20 --max-time 600 --retry 2 "$SEED_NODE_URL/$SEED_NODE_ARCHIVE" -o "$SEED_BOOTSTRAP_STAGE/$SEED_NODE_ARCHIVE"
  /usr/bin/curl --fail --show-error --location --proto '=https' --tlsv1.2 --connect-timeout 20 --max-time 60 --retry 2 "$SEED_NODE_URL/SHASUMS256.txt" -o "$SEED_BOOTSTRAP_STAGE/SHASUMS256.txt"
  /usr/bin/awk -v name="$SEED_NODE_ARCHIVE" '$2 == name {print}' "$SEED_BOOTSTRAP_STAGE/SHASUMS256.txt" > "$SEED_BOOTSTRAP_STAGE/checksum.txt"
  if [ "$(/usr/bin/wc -l < "$SEED_BOOTSTRAP_STAGE/checksum.txt" | /usr/bin/tr -d ' ')" != "1" ]; then
    sapling_message installer_028 >&2
    exit 1
  fi
  (cd "$SEED_BOOTSTRAP_STAGE" && /usr/bin/shasum -a 256 -c checksum.txt)
  /usr/bin/tar -xzf "$SEED_BOOTSTRAP_STAGE/$SEED_NODE_ARCHIVE" -C "$SEED_BOOTSTRAP_STAGE"
  "$SEED_BOOTSTRAP_STAGE/node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}/bin/node" --version
  if [ "$("$SEED_BOOTSTRAP_STAGE/node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}/bin/node" -p 'process.arch')" != "$SEED_MAC_ARCH" ]; then
    sapling_message installer_029 >&2
    exit 1
  fi
  # Keep the existing runtime until the replacement has downloaded and verified.
  if [ -e "$SEED_NODE_DIR" ]; then
    mv "$SEED_NODE_DIR" "$SEED_PROJECT_DIR/.runtime/node-replaced-$(date +%s)-$$"
  fi
  mv "$SEED_BOOTSTRAP_STAGE/node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}" "$SEED_NODE_DIR"
  trap - EXIT
  rm -rf "$SEED_BOOTSTRAP_STAGE"
  rmdir "$SEED_BOOTSTRAP_LOCK"
fi

if [ "$1" = "runtime-only" ]; then exit 0; fi

export PATH="$SEED_NODE_DIR/bin:$PATH"
export SEED_ROOT="$SEED_PROJECT_DIR"
export SEED_CODEX_BIN="$SEED_PROJECT_DIR/.runtime/codex/node_modules/.bin/codex"
export SEED_IMPORT_EXISTING_AUTH=0
cd "$SEED_PROJECT_DIR"
exec "$SEED_NODE_BIN" "$SEED_PROJECT_DIR/kernel/scripts/macos/cli.mjs" "$@"
