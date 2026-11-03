#!/bin/bash
# Runs before Node is available. Only tool aliases may leave the project;
# account/configuration/data and process ownership directories remain local.
sapling_node_probe() {
  SAPLING_NODE_PROBE="$SEED_PROJECT_DIR/.runtime/node-probe-$$-$RANDOM"
  "$@" > "$SAPLING_NODE_PROBE" 2>/dev/null & SAPLING_NODE_PROBE_PID=$!
  SAPLING_NODE_TICKS=0
  while kill -0 "$SAPLING_NODE_PROBE_PID" 2>/dev/null; do
    if [ "$SAPLING_NODE_TICKS" -ge 100 ]; then
      kill "$SAPLING_NODE_PROBE_PID" 2>/dev/null || true
      sleep 0.05; kill -KILL "$SAPLING_NODE_PROBE_PID" 2>/dev/null || true
      wait "$SAPLING_NODE_PROBE_PID" 2>/dev/null || true
      rm -f "$SAPLING_NODE_PROBE"; return 1
    fi
    sleep 0.05; SAPLING_NODE_TICKS=$((SAPLING_NODE_TICKS + 1))
  done
  if wait "$SAPLING_NODE_PROBE_PID"; then cat "$SAPLING_NODE_PROBE"; rm -f "$SAPLING_NODE_PROBE"; return 0; fi
  rm -f "$SAPLING_NODE_PROBE"; return 1
}
sapling_node_valid() {
  [ -x "$1/bin/node" ] && [ -f "$1/lib/node_modules/npm/bin/npm-cli.js" ] &&
  [ "$(sapling_node_probe "$1/bin/node" --version)" = "v$SEED_NODE_VERSION" ] &&
  [ "$(sapling_node_probe "$1/bin/node" -p 'process.arch')" = "$SEED_MAC_ARCH" ]
}
sapling_node_location() {
  SAPLING_NODE_ALIAS="$SEED_PROJECT_DIR/.runtime/node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}"
  SAPLING_NODE_MODE="${SAPLING_RUNTIME_MODE:-shared}"
  if [ -z "${SAPLING_RUNTIME_MODE:-}" ] && [ -f "$SEED_PROJECT_DIR/.runtime/runtime-mode" ]; then SAPLING_NODE_MODE="$(cat "$SEED_PROJECT_DIR/.runtime/runtime-mode")"; fi
  case "$SAPLING_NODE_MODE" in shared|portable) ;; *) sapling_message shared_mode >&2; return 1;; esac
  SAPLING_NODE_HOME="${SAPLING_RUNTIME_HOME:-$HOME/Library/Application Support/Saplingagent}"
  if [ "$SAPLING_NODE_MODE" = portable ]; then SAPLING_NODE_HOME="$SEED_PROJECT_DIR/.runtime/tool-store"; fi
  case "$SAPLING_NODE_HOME" in /*) ;; *) sapling_message shared_location >&2; return 1;; esac
  SAPLING_NODE_SOURCE="$SAPLING_NODE_ALIAS"
  if { [ "$SAPLING_NODE_MODE" != portable ] || [ ! -L "$SAPLING_NODE_ALIAS" ]; } && sapling_node_valid "$SAPLING_NODE_SOURCE"; then return; fi
  if [ "$SAPLING_NODE_MODE" != portable ]; then
    SAPLING_SYSTEM_NODE="$(command -v node || true)"
    if [ -n "$SAPLING_SYSTEM_NODE" ]; then
      # Resolve Homebrew/npm file symlinks before deriving the Node installation.
      SAPLING_NODE_LINKS=0
      while [ -L "$SAPLING_SYSTEM_NODE" ] && [ "$SAPLING_NODE_LINKS" -lt 40 ]; do
        SAPLING_NODE_LINK="$(/usr/bin/readlink "$SAPLING_SYSTEM_NODE")"
        case "$SAPLING_NODE_LINK" in /*) SAPLING_SYSTEM_NODE="$SAPLING_NODE_LINK";; *) SAPLING_SYSTEM_NODE="$(dirname "$SAPLING_SYSTEM_NODE")/$SAPLING_NODE_LINK";; esac
        SAPLING_NODE_LINKS=$((SAPLING_NODE_LINKS + 1))
      done
      if [ -n "$SAPLING_SYSTEM_NODE" ]; then
        SAPLING_SYSTEM_NODE="$(dirname "$(dirname "$SAPLING_SYSTEM_NODE")")"
        if sapling_node_valid "$SAPLING_SYSTEM_NODE"; then SAPLING_NODE_SOURCE="$SAPLING_SYSTEM_NODE"; return; fi
      fi
    fi
  fi
  SAPLING_NODE_SOURCE="$SAPLING_NODE_HOME/runtimes/node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}"
  if sapling_node_valid "$SAPLING_NODE_SOURCE"; then return; fi
  for SAPLING_NODE_REPAIRED in "$SAPLING_NODE_SOURCE"-repair-*; do
    if sapling_node_valid "$SAPLING_NODE_REPAIRED"; then SAPLING_NODE_SOURCE="$SAPLING_NODE_REPAIRED"; return; fi
  done
  if [ -e "$SAPLING_NODE_SOURCE" ]; then
    SAPLING_NODE_SOURCE="${SAPLING_NODE_SOURCE}-repair-$(date +%s)-$$"
  fi
}
sapling_link_node() {
  if [ "$SAPLING_NODE_SOURCE" != "$SAPLING_NODE_ALIAS" ]; then
    if [ -L "$SAPLING_NODE_ALIAS" ]; then /bin/rm "$SAPLING_NODE_ALIAS";
    elif [ -e "$SAPLING_NODE_ALIAS" ]; then /bin/mv "$SAPLING_NODE_ALIAS" "$SAPLING_NODE_ALIAS-previous-$(date +%s)-$$"; fi
    if ! /bin/ln -s "$SAPLING_NODE_SOURCE" "$SAPLING_NODE_ALIAS"; then
      mkdir -p "$SAPLING_NODE_ALIAS/bin" "$SAPLING_NODE_ALIAS/lib/node_modules"
      cp "$SAPLING_NODE_SOURCE/bin/node" "$SAPLING_NODE_ALIAS/bin/node"
      cp -R "$SAPLING_NODE_SOURCE/lib/node_modules/npm" "$SAPLING_NODE_ALIAS/lib/node_modules/npm"
    fi
  fi
  printf '%s\n' "$SAPLING_NODE_MODE" > "$SEED_PROJECT_DIR/.runtime/runtime-mode"
  SEED_NODE_DIR="$SAPLING_NODE_ALIAS"; SEED_NODE_BIN="$SEED_NODE_DIR/bin/node"
}
