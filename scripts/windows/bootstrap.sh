#!/bin/bash
# Compatibility entry; implementation is under kernel/.
exec /bin/bash "$(dirname "${BASH_SOURCE[0]}")/../../kernel/scripts/windows/bootstrap.sh" "$@"
