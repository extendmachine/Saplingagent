#!/bin/bash
set -euo pipefail

SEED_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
case "${1:-}" in
  install|login|start|doctor|logout) ;;
  *) echo "可用操作：install / login / start / doctor / logout。" >&2; exit 1 ;;
esac
if [ "$(/usr/bin/uname -s)" != "Darwin" ]; then
  echo "此安装入口目前只支持 macOS。" >&2
  exit 1
fi
SEED_OS_VERSION="$(/usr/bin/sw_vers -productVersion)"
SEED_OS_MAJOR="${SEED_OS_VERSION%%.*}"
SEED_OS_REST="${SEED_OS_VERSION#*.}"
SEED_OS_MINOR="${SEED_OS_REST%%.*}"
if [ "$SEED_OS_MAJOR" -lt 13 ] || { [ "$SEED_OS_MAJOR" -eq 13 ] && [ "$SEED_OS_MINOR" -lt 5 ]; }; then
  echo "需要 macOS 13.5 或更新版本；当前为 $SEED_OS_VERSION。" >&2
  exit 1
fi
SEED_MAC_ARCH="$(/usr/bin/uname -m)"
case "$SEED_MAC_ARCH" in
  arm64) ;;
  x86_64) SEED_MAC_ARCH="x64" ;;
  *) echo "不支持的 Mac 架构：$SEED_MAC_ARCH" >&2; exit 1 ;;
esac
SEED_NODE_VERSION="$(/usr/bin/plutil -extract nodeVersion raw -o - "$SEED_PROJECT_DIR/config/macos.json")"
if ! [[ "$SEED_NODE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "config/macos.json 中 Node 版本无效。" >&2
  exit 1
fi
SEED_NODE_DIR="$SEED_PROJECT_DIR/.runtime/node-v$SEED_NODE_VERSION-darwin-$SEED_MAC_ARCH"
SEED_NODE_BIN="$SEED_NODE_DIR/bin/node"

if [ ! -x "$SEED_NODE_BIN" ] || [ "$("$SEED_NODE_BIN" --version)" != "v$SEED_NODE_VERSION" ]; then
  if [ "$1" != "install" ]; then
    echo "项目内 Node 尚未安装或版本不一致。请先运行 1-安装.command。" >&2
    exit 1
  fi
  mkdir -p "$SEED_PROJECT_DIR/.runtime"
  SEED_BOOTSTRAP_LOCK="$SEED_PROJECT_DIR/.runtime/node-install.lock"
  if ! mkdir "$SEED_BOOTSTRAP_LOCK" 2>/dev/null; then
    echo "另一轮 Node 安装正在进行，请稍后重试。若安装窗口已关闭，按说明移除 .runtime/node-install.lock。" >&2
    exit 1
  fi
  SEED_BOOTSTRAP_STAGE=""
  trap 'rm -rf "$SEED_BOOTSTRAP_STAGE"; rmdir "$SEED_BOOTSTRAP_LOCK"' EXIT
  SEED_BOOTSTRAP_STAGE="$(/usr/bin/mktemp -d "$SEED_PROJECT_DIR/.runtime/node-install.XXXXXX")"
  SEED_NODE_ARCHIVE="node-v$SEED_NODE_VERSION-darwin-$SEED_MAC_ARCH.tar.gz"
  SEED_NODE_URL="https://nodejs.org/dist/v$SEED_NODE_VERSION"
  echo "正在从 Node.js 官方站点安装项目内 Node $SEED_NODE_VERSION ($SEED_MAC_ARCH)…"
  /usr/bin/curl --fail --show-error --location --proto '=https' --tlsv1.2 --connect-timeout 20 --max-time 600 --retry 2 "$SEED_NODE_URL/$SEED_NODE_ARCHIVE" -o "$SEED_BOOTSTRAP_STAGE/$SEED_NODE_ARCHIVE"
  /usr/bin/curl --fail --show-error --location --proto '=https' --tlsv1.2 --connect-timeout 20 --max-time 60 --retry 2 "$SEED_NODE_URL/SHASUMS256.txt" -o "$SEED_BOOTSTRAP_STAGE/SHASUMS256.txt"
  /usr/bin/awk -v name="$SEED_NODE_ARCHIVE" '$2 == name {print}' "$SEED_BOOTSTRAP_STAGE/SHASUMS256.txt" > "$SEED_BOOTSTRAP_STAGE/checksum.txt"
  if [ "$(/usr/bin/wc -l < "$SEED_BOOTSTRAP_STAGE/checksum.txt" | /usr/bin/tr -d ' ')" != "1" ]; then
    echo "官方校验表缺少对应 Node 文件；未安装。" >&2
    exit 1
  fi
  (cd "$SEED_BOOTSTRAP_STAGE" && /usr/bin/shasum -a 256 -c checksum.txt)
  /usr/bin/tar -xzf "$SEED_BOOTSTRAP_STAGE/$SEED_NODE_ARCHIVE" -C "$SEED_BOOTSTRAP_STAGE"
  "$SEED_BOOTSTRAP_STAGE/node-v$SEED_NODE_VERSION-darwin-$SEED_MAC_ARCH/bin/node" --version
  # Keep the existing runtime until the replacement has downloaded and verified.
  if [ -e "$SEED_NODE_DIR" ]; then
    mv "$SEED_NODE_DIR" "$SEED_PROJECT_DIR/.runtime/node-replaced-$(date +%s)-$$"
  fi
  mv "$SEED_BOOTSTRAP_STAGE/node-v$SEED_NODE_VERSION-darwin-$SEED_MAC_ARCH" "$SEED_NODE_DIR"
  trap - EXIT
  rm -rf "$SEED_BOOTSTRAP_STAGE"
  rmdir "$SEED_BOOTSTRAP_LOCK"
fi

export PATH="$SEED_NODE_DIR/bin:$PATH"
export SEED_ROOT="$SEED_PROJECT_DIR"
export SEED_CODEX_BIN="$SEED_PROJECT_DIR/.runtime/codex/node_modules/.bin/codex"
export SEED_IMPORT_EXISTING_AUTH=0
cd "$SEED_PROJECT_DIR"
exec "$SEED_NODE_BIN" "$SEED_PROJECT_DIR/scripts/macos/cli.mjs" "$@"
