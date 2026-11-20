#!/bin/bash
set -euo pipefail


SEED_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
source "$SEED_PROJECT_DIR/kernel/localization/installer-messages.sh"
source "$SEED_PROJECT_DIR/kernel/scripts/macos/device.sh"
case "${1:-}" in
  install|login|configure|start|doctor|logout|opencode|kernel|runtime-only) ;;
  *) sapling_message installer_018 >&2; exit 1 ;;
esac
if ! SEED_OS_VERSION="$(sapling_macos_version)"; then
  sapling_message installer_019 >&2
  exit 1
fi
SEED_OS_MAJOR="${SEED_OS_VERSION%%.*}"
SEED_OS_REST="${SEED_OS_VERSION#*.}"
SEED_OS_MINOR="${SEED_OS_REST%%.*}"
if [ "$SEED_OS_MAJOR" -lt 13 ] || { [ "$SEED_OS_MAJOR" -eq 13 ] && [ "$SEED_OS_MINOR" -lt 5 ]; }; then
  sapling_message installer_020 >&2
  exit 1
fi
if ! SEED_MAC_ARCH="$(sapling_macos_arch)"; then
  SEED_MAC_ARCH=unknown
  sapling_message installer_021 >&2
  exit 1
fi
sapling_message installer_022
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


SEED_NODE_VERSION="$(/usr/bin/plutil -extract nodeVersion raw -o - "$SEED_PROJECT_DIR/kernel/config/macos.json")"
if ! [[ "${SEED_NODE_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  sapling_message installer_023 >&2
  exit 1
fi
source "$SEED_PROJECT_DIR/kernel/tooling/node-bootstrap.sh"
sapling_node_location
SEED_NODE_DIR="$SAPLING_NODE_SOURCE"
SEED_NODE_BIN="$SEED_NODE_DIR/bin/node"

if ! sapling_node_valid "$SEED_NODE_DIR"; then
  if [ "$1" != "install" ] && [ "$1" != "runtime-only" ]; then
    sapling_message installer_024 >&2
    exit 1
  fi
  mkdir -p "$SEED_PROJECT_DIR/.runtime"
  mkdir -p "$SAPLING_NODE_HOME/locks" "$SAPLING_NODE_HOME/staging"
  SEED_BOOTSTRAP_LOCK="$SAPLING_NODE_HOME/locks/node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}.lock"
  exec 9>>"$SEED_BOOTSTRAP_LOCK"
  sapling_acquire_node_lock
  # A concurrent project may have finished while this installer was waiting.
  sapling_node_location
  if ! sapling_node_valid "$SAPLING_NODE_SOURCE"; then
    if [ -e "$SEED_PROJECT_DIR/.runtime/kernel-operation.lock" ] || [ -e "$SEED_PROJECT_DIR/.runtime/launcher-compile.lock" ] || [ -e "$SEED_PROJECT_DIR/.runtime/project-finalization.json" ]; then
      sapling_message installer_026 >&2
      exit 1
    fi
    SEED_BOOTSTRAP_STAGE="$(/usr/bin/mktemp -d "$SAPLING_NODE_HOME/staging/node-install.XXXXXX")"
    trap 'rm -rf -- "$SEED_BOOTSTRAP_STAGE"' EXIT
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
    SEED_STAGED_NODE="$SEED_BOOTSTRAP_STAGE/node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}"
    if ! sapling_node_valid "$SEED_STAGED_NODE"; then
      sapling_message installer_029 >&2
      exit 1
    fi
    # Publish on the same volume. Older installers use a different lock and a
    # different destination; neither can move a generation in use by a project.
    mkdir -p "$SAPLING_NODE_HOME/runtimes"
    SAPLING_NODE_SOURCE="$SAPLING_NODE_HOME/runtimes/node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}-gen-${SEED_BOOTSTRAP_STAGE##*/}"
    /usr/bin/perl -e 'rename($ARGV[0], $ARGV[1]) or die "Node runtime publication: $!"' "$SEED_STAGED_NODE" "$SAPLING_NODE_SOURCE"
    rm -rf -- "$SEED_BOOTSTRAP_STAGE"
    trap - EXIT
  fi
  exec 9>&-
fi
sapling_link_node

if [ "$1" = "runtime-only" ]; then exit 0; fi

export PATH="$SEED_NODE_DIR/bin:$PATH"
export SEED_ROOT="$SEED_PROJECT_DIR"
export SEED_CODEX_BIN="$SEED_PROJECT_DIR/.runtime/codex/node_modules/.bin/codex"
export SEED_IMPORT_EXISTING_AUTH=0
cd "$SEED_PROJECT_DIR"
exec "$SEED_NODE_BIN" "$SEED_PROJECT_DIR/kernel/scripts/macos/cli.mjs" "$@"
