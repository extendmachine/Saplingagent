#!/bin/bash
set -uo pipefail
SEED_ENTRY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
/bin/bash "$SEED_ENTRY_ROOT/scripts/macos/bootstrap.sh" "$@"
SEED_ENTRY_STATUS=$?
if [ "$SEED_ENTRY_STATUS" -ne 0 ]; then
  echo ""
  echo "操作未完成。请查看上面的具体原因；可运行‘4-诊断.command’。"
fi
if [ -t 0 ]; then
  echo ""
  read -r -p "按回车关闭此窗口…" SEED_ENTRY_REPLY
fi
exit "$SEED_ENTRY_STATUS"
