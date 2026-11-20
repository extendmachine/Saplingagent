#!/bin/bash
set -euo pipefail
SEED_CODEX_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
SEED_CODEX_NODE_VERSION="$(/usr/bin/plutil -extract nodeVersion raw -o - "$SEED_CODEX_ROOT/kernel/config/macos.json")"
SEED_CODEX_ARCH="$(/usr/bin/uname -m)"
if [ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true)" = "1" ]; then SEED_CODEX_ARCH="arm64"; fi
if [ "$SEED_CODEX_ARCH" = "x86_64" ]; then SEED_CODEX_ARCH=x64; fi
SEED_CODEX_NODE="$SEED_CODEX_ROOT/.runtime/node-v$SEED_CODEX_NODE_VERSION-darwin-$SEED_CODEX_ARCH/bin/node"
export CODEX_HOME="$SEED_CODEX_ROOT/local-secrets/codex"
cd "$SEED_CODEX_ROOT"
SEED_CODEX_BIN="$("$SEED_CODEX_NODE" --input-type=module -e 'import {codexBinary} from "./kernel/contracts/local-process.mjs"; console.log(codexBinary(process.cwd()));' -- 2>/dev/null)"
exec "$SEED_CODEX_BIN" -c 'cli_auth_credentials_store="file"' "$@"
