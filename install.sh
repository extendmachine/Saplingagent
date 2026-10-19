#!/bin/bash
# Delivery entry only. Installer implementation is part of kernel/.
set -euo pipefail
sapling_entry="${BASH_SOURCE[0]:-}"
if [ -n "$sapling_entry" ] && [ -f "$(dirname "$sapling_entry")/kernel/scripts/install-source.sh" ]; then
  exec /bin/bash "$(dirname "$sapling_entry")/kernel/scripts/install-source.sh" "$@"
fi
curl -fsSL https://raw.githubusercontent.com/extendmachine/Saplingagent/release/kernel/scripts/install-source.sh | /bin/bash -s -- "$@"
