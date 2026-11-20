# GNU/Linux only. Called by bootstrap.sh while the project installation lock is held.
linux_node_usable() {
  local executable="$1" real prefix
  [ -x "$executable" ] || return 1
  real="$(readlink -f -- "$executable")" || return 1
  prefix="$(dirname "$(dirname "$real")")"
  [ -f "$prefix/lib/node_modules/npm/bin/npm-cli.js" ] &&
    [ "$(timeout 10 "$executable" -p 'process.version + "/" + process.platform + "/" + process.arch' 2>/dev/null)" = "v$version/linux/$arch" ]
}

# Write only the selected architecture to a complete generation on the target filesystem.
linux_install_node() (
  set -euo pipefail
  local home="$1" name="node-v$version-linux-$arch" archive url stage target digest binary
  for tool in curl sha256sum tar gzip; do
    command -v "$tool" >/dev/null || { sapling_message linux_download_tools >&2; exit 1; }
  done
  mkdir -p -- "$home/runtimes" "$home/locks"
  exec 8>>"$home/locks/$name.flock"
  flock -w 660 8 || { sapling_message linux_busy >&2; exit 1; }
  for binary in "$home/runtimes/$name/bin/node" "$home/runtimes/$name"-gen-*/bin/node; do
    if linux_node_usable "$binary"; then printf '%s\n' "$binary"; exit 0; fi
  done
  url="https://nodejs.org/dist/v$version"
  archive="$name.tar.gz"
  stage="$(mktemp -d "$home/runtimes/.linux-node.XXXXXXXX")"
  trap 'rm -rf -- "$stage"' EXIT
  local -a options=(--fail --show-error --silent --location --proto '=https' --proto-redir '=https' --connect-timeout 20 --max-time 540 --retry 2)
  sapling_message linux_downloading_node >&2
  curl "${options[@]}" "$url/SHASUMS256.txt" -o "$stage/SHASUMS256.txt"
  curl "${options[@]}" "$url/$archive" -o "$stage/$archive"
  digest="$(awk -v archive="$archive" '$2 == archive {print $1}' "$stage/SHASUMS256.txt")"
  [[ "$digest" =~ ^[a-fA-F0-9]{64}$ ]] || { sapling_message linux_checksum >&2; exit 1; }
  (cd "$stage" && printf '%s  %s\n' "$digest" "$archive" | sha256sum --check --status) || { sapling_message linux_checksum >&2; exit 1; }
  tar -xzf "$stage/$archive" --no-same-owner -C "$stage"
  linux_node_usable "$stage/$name/bin/node" || { sapling_message linux_node >&2; exit 1; }
  target="$home/runtimes/$name"
  if [ -e "$target" ] || [ -L "$target" ]; then
    if [ "$mode" = portable ]; then sapling_message linux_portable_repair >&2; exit 1; fi
    target="$target-gen-${stage##*.}"
  fi
  mv -T -- "$stage/$name" "$target"
  printf '%s\n' "$target/bin/node"
)
