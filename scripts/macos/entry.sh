#!/bin/bash
set -uo pipefail
SEED_ENTRY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
/bin/bash "$SEED_ENTRY_ROOT/scripts/macos/bootstrap.sh" "$@"
SEED_ENTRY_STATUS=$?
if [ "$SEED_ENTRY_STATUS" -ne 0 ]; then
  echo ""
  echo "Operation incomplete. Check the error above or run 4-Doctor.command."
fi
if [ -t 0 ]; then
  echo ""
  read -r -p "Press Enter to close this window…" SEED_ENTRY_REPLY
fi
exit "$SEED_ENTRY_STATUS"
