#!/bin/bash
set -euo pipefail
SAPLING_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
export SEED_ROOT="$SAPLING_ROOT"
exec /bin/bash "$SAPLING_ROOT/kernel/scripts/Saplingagent.sh" "$@"
