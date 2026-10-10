#!/bin/bash
SEED_ENTRY_ROOT="$(cd "$(dirname "$0")" && pwd -P)"
exec /bin/bash "$SEED_ENTRY_ROOT/scripts/macos/entry.sh" login "$@"
