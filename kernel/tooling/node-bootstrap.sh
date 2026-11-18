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
# macOS ships readlink and Bash even on releases without a realpath utility.
sapling_real_file() {
  local file="$1" directory target hops=0
  while [ -L "$file" ]; do
    [ "$hops" -lt 40 ] || return 1
    target="$(/usr/bin/readlink "$file")" || return 1
    case "$target" in /*) file="$target";; *) file="$(dirname "$file")/$target";; esac
    hops=$((hops+1))
  done
  [ -f "$file" ] || return 1
  directory="$(cd "$(dirname "$file")" && pwd -P)" || return 1
  printf '%s/%s\n' "$directory" "$(basename "$file")"
}
sapling_node_in_mode() {
  local node_real npm_real
  node_real="$(sapling_real_file "$1/bin/node" 2>/dev/null)" || return 1
  npm_real="$(sapling_real_file "$1/lib/node_modules/npm/bin/npm-cli.js" 2>/dev/null)" || return 1
  if [ "$SAPLING_NODE_MODE" = portable ]; then
    case "$node_real" in "$SAPLING_PROJECT_REAL"/*) ;; *) return 1;; esac
    case "$npm_real" in "$SAPLING_PROJECT_REAL"/*) ;; *) return 1;; esac
  else
    case "$node_real" in "$SAPLING_PROJECT_REAL"/.runtime/tool-store/*) return 1;; esac
  fi
}
sapling_node_valid() {
  sapling_node_in_mode "$1" &&
  [ -x "$1/bin/node" ] && [ -f "$1/lib/node_modules/npm/bin/npm-cli.js" ] &&
  [ "$(sapling_node_probe "$1/bin/node" --version)" = "v$SEED_NODE_VERSION" ] &&
  [ "$(sapling_node_probe "$1/bin/node" -p 'process.arch')" = "$SEED_MAC_ARCH" ]
}
sapling_node_location() {
  SAPLING_NODE_ALIAS="$SEED_PROJECT_DIR/.runtime/node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}"
  SAPLING_PROJECT_REAL="$(cd "$SEED_PROJECT_DIR" && pwd -P)"
  local receipt="$SEED_PROJECT_DIR/.runtime/tool-bindings.json" saved_mode="" shared_home=""
  SAPLING_PREVIOUS_MODE=""
  if [ -f "$receipt" ]; then
    saved_mode="$(/usr/bin/plutil -extract mode raw -o - "$receipt" 2>/dev/null || true)"
  fi
  if [ -f "$SEED_PROJECT_DIR/.runtime/runtime-mode" ]; then
    SAPLING_PREVIOUS_MODE="$(cat "$SEED_PROJECT_DIR/.runtime/runtime-mode")"
  else
    SAPLING_PREVIOUS_MODE="$saved_mode"
  fi
  SAPLING_NODE_MODE="${SAPLING_RUNTIME_MODE:-${SAPLING_PREVIOUS_MODE:-shared}}"
  case "$SAPLING_NODE_MODE" in shared|portable) ;; *) sapling_message shared_mode >&2; return 1;; esac
  if [ -z "${SAPLING_RUNTIME_HOME:-}" ] && [ "$SAPLING_NODE_MODE" = shared ] && [ -n "$saved_mode" ]; then
    if [ "$saved_mode" = shared ] && [ "$(/usr/bin/plutil -extract homeKind raw -o - "$receipt" 2>/dev/null || true)" != default ]; then
      shared_home="$(/usr/bin/plutil -extract home raw -o - "$receipt" 2>/dev/null || true)"
    else
      shared_home="$(/usr/bin/plutil -extract sharedHome raw -o - "$receipt" 2>/dev/null || true)"
    fi
    case "$shared_home" in /*) ;; *) shared_home="";; esac
  fi
  SAPLING_NODE_HOME="${SAPLING_RUNTIME_HOME:-${shared_home:-$HOME/Library/Application Support/Saplingagent}}"
  if [ "$SAPLING_NODE_MODE" = portable ]; then SAPLING_NODE_HOME="$SEED_PROJECT_DIR/.runtime/tool-store"; fi
  case "$SAPLING_NODE_HOME" in /*) ;; *) sapling_message shared_location >&2; return 1;; esac
  SAPLING_NODE_SOURCE="$SAPLING_NODE_ALIAS"
  if { [ "$SAPLING_NODE_MODE" != shared ] || [ "$SAPLING_PREVIOUS_MODE" != portable ]; } && sapling_node_valid "$SAPLING_NODE_SOURCE"; then return; fi
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
        if [ "$SAPLING_SYSTEM_NODE" != "$SAPLING_NODE_ALIAS" ] && sapling_node_valid "$SAPLING_SYSTEM_NODE"; then SAPLING_NODE_SOURCE="$SAPLING_SYSTEM_NODE"; return; fi
      fi
    fi
  fi
  SAPLING_NODE_SOURCE="$SAPLING_NODE_HOME/runtimes/node-v${SEED_NODE_VERSION}-darwin-${SEED_MAC_ARCH}"
  if sapling_node_valid "$SAPLING_NODE_SOURCE"; then return; fi
  for SAPLING_NODE_REPAIRED in "$SAPLING_NODE_SOURCE"-gen-* "$SAPLING_NODE_SOURCE"-repair-*; do
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
    SAPLING_NODE_LINK_TARGET="$SAPLING_NODE_SOURCE"
    case "$SAPLING_NODE_SOURCE" in "$SEED_PROJECT_DIR/.runtime/"*) SAPLING_NODE_LINK_TARGET="${SAPLING_NODE_SOURCE#"$SEED_PROJECT_DIR/.runtime/"}";; esac
    if ! /bin/ln -s "$SAPLING_NODE_LINK_TARGET" "$SAPLING_NODE_ALIAS"; then
      mkdir -p "$SAPLING_NODE_ALIAS/bin" "$SAPLING_NODE_ALIAS/lib/node_modules"
      cp "$SAPLING_NODE_SOURCE/bin/node" "$SAPLING_NODE_ALIAS/bin/node"
      cp -R "$SAPLING_NODE_SOURCE/lib/node_modules/npm" "$SAPLING_NODE_ALIAS/lib/node_modules/npm"
    fi
  fi
  printf '%s\n' "$SAPLING_NODE_MODE" > "$SEED_PROJECT_DIR/.runtime/runtime-mode"
  SEED_NODE_DIR="$SAPLING_NODE_ALIAS"; SEED_NODE_BIN="$SEED_NODE_DIR/bin/node"
}

# FD 9 is opened by the shell before Node exists. Perl is already required by
# macOS shasum. flock acts on the inherited open-file description and the OS
# releases it when its last holder exits, even after SIGKILL.
sapling_acquire_node_lock() {
  local elapsed=0 status
  while :; do
    if /usr/bin/perl -MFcntl=:flock -MErrno=EWOULDBLOCK,EAGAIN -e '
      open(my $lock, ">&=", 9) or die "Node installer lock: $!";
      flock($lock, LOCK_EX | LOCK_NB) and exit 0;
      exit 75 if $! == EWOULDBLOCK || $! == EAGAIN;
      die "Node installer lock: $!";
    '; then return 0; else status=$?; fi
    if [ "$status" -ne 75 ]; then return "$status"; fi
    if [ "$elapsed" -ge 600 ]; then
      sapling_message installer_025 >&2
      printf '%s\n' "$SEED_BOOTSTRAP_LOCK" >&2
      return 1
    fi
    if [ $((elapsed % 15)) -eq 0 ]; then sapling_message installer_025 >&2; fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
}
