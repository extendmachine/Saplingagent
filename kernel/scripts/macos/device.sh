# Local checks for the macOS installer and its Codex wrapper. The public launcher
# selects the operating system. Never infer a Darwin package from routing alone.
sapling_macos_version() {
  local version
  version="$(/usr/bin/sw_vers -productVersion 2>/dev/null)" || version=''
  if ! [[ "$version" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]]; then
    version="$(/usr/bin/plutil -extract ProductVersion raw -o - /System/Library/CoreServices/SystemVersion.plist 2>/dev/null)" || return 1
  fi
  [[ "$version" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || return 1
  printf '%s\n' "$version"
}

sapling_macos_arch() {
  # A translated terminal can report x86_64 on Apple Silicon. Hardware and
  # translation evidence take precedence over the current process architecture.
  if [ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null)" = 1 ] ||
     [ "$(/usr/sbin/sysctl -n sysctl.proc_translated 2>/dev/null)" = 1 ]; then
    printf '%s\n' arm64; return
  fi
  case "$(/usr/sbin/sysctl -n machdep.cpu.brand_string 2>/dev/null)" in
    Apple*) printf '%s\n' arm64; return ;;
    *Intel*) printf '%s\n' x64; return ;;
  esac
  local machine intel_arch=''
  for machine in "$(/usr/bin/uname -m 2>/dev/null)" "$(/usr/sbin/sysctl -n hw.machine 2>/dev/null)"; do
    case "$machine" in
      arm64|arm64e|aarch64) printf '%s\n' arm64; return ;;
      x86_64) intel_arch=x64 ;;
    esac
  done
  [ -n "$intel_arch" ] || return 1
  printf '%s\n' "$intel_arch"
}
