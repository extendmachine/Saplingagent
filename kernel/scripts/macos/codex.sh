#!/bin/bash
set -euo pipefail
SEED_CODEX_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
SEED_CODEX_NODE_VERSION="$(/usr/bin/plutil -extract nodeVersion raw -o - "$SEED_CODEX_ROOT/kernel/config/macos.json")"
source "$SEED_CODEX_ROOT/kernel/scripts/macos/device.sh"
if ! SEED_CODEX_ARCH="$(sapling_macos_arch)"; then
  source "$SEED_CODEX_ROOT/kernel/localization/installer-messages.sh"
  SEED_MAC_ARCH=unknown
  sapling_message installer_021 >&2
  exit 1
fi
SEED_CODEX_NODE="$SEED_CODEX_ROOT/.runtime/node-v$SEED_CODEX_NODE_VERSION-darwin-$SEED_CODEX_ARCH/bin/node"
export CODEX_HOME="$SEED_CODEX_ROOT/local-secrets/codex"
cd "$SEED_CODEX_ROOT"
SEED_CODEX_BIN="$("$SEED_CODEX_NODE" --input-type=module -e 'import {codexBinary} from "./kernel/contracts/local-process.mjs"; console.log(codexBinary(process.cwd()));' -- 2>/dev/null)"
exec "$SEED_CODEX_BIN" -c 'cli_auth_credentials_store="file"' "$@"
