#!/bin/bash
set -euo pipefail

say() {
  if [ "${SAPLING_LANG:-en}" = zh ]; then printf '%s\n' "$2"; else printf '%s\n' "$1"; fi
}

SEED_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
case "${1:-}" in
  install|login|configure|start|doctor|logout|opencode) ;;
  *) say "Available actions: install / login / start / doctor / logout / configure / opencode." "可用操作：install / login / start / doctor / logout / configure / opencode。" >&2; exit 1 ;;
esac
if [ "$(/usr/bin/uname -s)" != "Darwin" ]; then
  say "This installer currently supports macOS only." "此安装程序目前仅支持 macOS。" >&2
  exit 1
fi
SEED_OS_VERSION="$(/usr/bin/sw_vers -productVersion)"
SEED_OS_MAJOR="${SEED_OS_VERSION%%.*}"
SEED_OS_REST="${SEED_OS_VERSION#*.}"
SEED_OS_MINOR="${SEED_OS_REST%%.*}"
if [ "$SEED_OS_MAJOR" -lt 13 ] || { [ "$SEED_OS_MAJOR" -eq 13 ] && [ "$SEED_OS_MINOR" -lt 5 ]; }; then
  say "macOS 13.5 or later is required; current version: ${SEED_OS_VERSION}." "需要 macOS 13.5 或更高版本；当前版本：${SEED_OS_VERSION}。" >&2
  exit 1
fi
SEED_MAC_ARCH="$(/usr/bin/uname -m)"
# Detect Apple Silicon even when the terminal is running under Rosetta.
if [ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true)" = "1" ]; then SEED_MAC_ARCH="arm64"; fi
case "${SEED_MAC_ARCH}" in
  arm64) ;;
  x86_64) SEED_MAC_ARCH="x64" ;;
  *) say "Unsupported Mac architecture:${SEED_MAC_ARCH}" "不支持的 Mac 架构：${SEED_MAC_ARCH}" >&2; exit 1 ;;
esac
say "Detected device: macOS ${SEED_OS_VERSION}, ${SEED_MAC_ARCH}. Selecting matching project runtime." "检测到设备：macOS ${SEED_OS_VERSION}，${SEED_MAC_ARCH}。自动选择对应项目运行环境。"
SEED_NODE_VERSION="$(/usr/bin/plutil -extract nodeVersion raw -o - "$SEED_PROJECT_DIR/config/macos.json")"
if ! [[ "${SEED_NODE_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  say "Invalid Node version in config/macos.json." "config/macos.json 中的 Node 版本无效。" >&2
  exit 1
fi
SEED_NODE_DIR="$SEED_PROJECT_DIR/.runtime/node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}"
SEED_NODE_BIN="$SEED_NODE_DIR/bin/node"

if [ ! -x "$SEED_NODE_BIN" ] || [ "$("$SEED_NODE_BIN" --version)" != "v${SEED_NODE_VERSION}" ] || [ "$("$SEED_NODE_BIN" -p 'process.arch')" != "$SEED_MAC_ARCH" ]; then
  if [ "$1" != "install" ]; then
    say "Project-local Node is not installed or has a different version. Open Saplingagent.sh and choose Install / update first." "项目内 Node 未安装或版本不符。请运行 bash Saplingagent.sh，先选择安装 / 更新。" >&2
    exit 1
  fi
  mkdir -p "$SEED_PROJECT_DIR/.runtime"
  SEED_BOOTSTRAP_LOCK="$SEED_PROJECT_DIR/.runtime/node-install.lock"
  if ! mkdir "$SEED_BOOTSTRAP_LOCK" 2>/dev/null; then
    say "Another Node installation is in progress. Retry later; if its window has closed, remove .runtime/node-install.lock as documented." "另一个 Node 安装正在进行。请稍后重试；确认其窗口已关闭后，按文档清理 .runtime/node-install.lock。" >&2
    exit 1
  fi
  SEED_BOOTSTRAP_STAGE=""
  trap 'rm -rf "$SEED_BOOTSTRAP_STAGE"; rmdir "$SEED_BOOTSTRAP_LOCK"' EXIT
  SEED_BOOTSTRAP_STAGE="$(/usr/bin/mktemp -d "$SEED_PROJECT_DIR/.runtime/node-install.XXXXXX")"
  SEED_NODE_ARCHIVE="node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}.tar.gz"
  SEED_NODE_URL="https://nodejs.org/dist/v${SEED_NODE_VERSION}"
  say "Installing project-local Node ${SEED_NODE_VERSION} (${SEED_MAC_ARCH}) from the official Node.js website…" "正在从 Node.js 官方网站安装项目内 Node ${SEED_NODE_VERSION}（${SEED_MAC_ARCH}）…"
  /usr/bin/curl --fail --show-error --location --proto '=https' --tlsv1.2 --connect-timeout 20 --max-time 600 --retry 2 "$SEED_NODE_URL/$SEED_NODE_ARCHIVE" -o "$SEED_BOOTSTRAP_STAGE/$SEED_NODE_ARCHIVE"
  /usr/bin/curl --fail --show-error --location --proto '=https' --tlsv1.2 --connect-timeout 20 --max-time 60 --retry 2 "$SEED_NODE_URL/SHASUMS256.txt" -o "$SEED_BOOTSTRAP_STAGE/SHASUMS256.txt"
  /usr/bin/awk -v name="$SEED_NODE_ARCHIVE" '$2 == name {print}' "$SEED_BOOTSTRAP_STAGE/SHASUMS256.txt" > "$SEED_BOOTSTRAP_STAGE/checksum.txt"
  if [ "$(/usr/bin/wc -l < "$SEED_BOOTSTRAP_STAGE/checksum.txt" | /usr/bin/tr -d ' ')" != "1" ]; then
    say "The official checksum list does not contain the requested Node file; nothing was installed." "官方校验清单中没有所需 Node 文件，本次未安装。" >&2
    exit 1
  fi
  (cd "$SEED_BOOTSTRAP_STAGE" && /usr/bin/shasum -a 256 -c checksum.txt)
  /usr/bin/tar -xzf "$SEED_BOOTSTRAP_STAGE/$SEED_NODE_ARCHIVE" -C "$SEED_BOOTSTRAP_STAGE"
  "$SEED_BOOTSTRAP_STAGE/node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}/bin/node" --version
  if [ "$("$SEED_BOOTSTRAP_STAGE/node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}/bin/node" -p 'process.arch')" != "$SEED_MAC_ARCH" ]; then
    say 'Downloaded Node architecture does not match this device.' '下载的 Node 架构与当前设备不匹配。' >&2
    exit 1
  fi
  # Keep the existing runtime until the replacement has downloaded and verified.
  if [ -e "$SEED_NODE_DIR" ]; then
    mv "$SEED_NODE_DIR" "$SEED_PROJECT_DIR/.runtime/node-replaced-$(date +%s)-$$"
  fi
  mv "$SEED_BOOTSTRAP_STAGE/node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}" "$SEED_NODE_DIR"
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
