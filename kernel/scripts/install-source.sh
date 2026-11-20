#!/bin/bash
# Cross-platform release downloader for Bash 3.2 or later.
set -euo pipefail
sapling_lang="${SAPLING_LANG:-en}"
sapling_destination='./Saplingagent'
sapling_requested="${SAPLING_PLATFORM-}"
sapling_has_platform="${SAPLING_PLATFORM+x}"
sapling_download_only=0
sapling_stage=''
say() { if [ "$sapling_lang" = zh ]; then printf '%s\n' "$2"; else printf '%s\n' "$1"; fi; }
fail() { say "$1" "$2" >&2; exit 1; }
usage() {
  say 'Usage: bash install.sh [--dir PATH] [--lang en|zh] [--platform auto|macos|windows|linux] [--download-only]' \
      '用法：bash install.sh [--dir 路径] [--lang en|zh] [--platform auto|macos|windows|linux] [--download-only]'
  say 'Downloads release into a new folder and starts configuration. Use --download-only to install later.' \
      '将 release 下载到新文件夹并启动配置。选择 --download-only 可以稍后再安装。'
}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dir|--lang)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      if [ "$1" = --dir ]; then sapling_destination="$2"; else sapling_lang="$2"; fi
      shift 2 ;;
    --platform)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      sapling_requested="$2"; sapling_has_platform=x; shift 2 ;;
    --download-only) sapling_download_only=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
case "$sapling_lang" in en|zh) ;; *) usage >&2; exit 2 ;; esac
if [ -n "$sapling_has_platform" ]; then
  case "$sapling_requested" in auto|macos|windows|linux) ;; *) usage >&2; exit 2 ;; esac
fi
for sapling_command in curl tar mktemp; do
  command -v "$sapling_command" >/dev/null || fail "Missing command: $sapling_command" "缺少命令：$sapling_command"
done
if command -v sha256sum >/dev/null; then sapling_hash_command=sha256sum;
elif command -v shasum >/dev/null; then sapling_hash_command=shasum;
else fail 'A SHA256 utility is required (sha256sum or shasum).' '需要 SHA256 校验工具（sha256sum 或 shasum）。'; fi
# Interactive children must read the terminal, not the downloaded script stream.
if [ "$sapling_download_only" -eq 0 ]; then
  if ! { exec 3</dev/tty; } 2>/dev/null; then
    fail 'Open a terminal, or use --download-only and run Saplingagent.sh later.' '请在终端运行；或使用 --download-only，下载后再运行 Saplingagent.sh。'
  fi
fi
[ -n "$sapling_destination" ] || { usage >&2; exit 2; }
[ ! -e "$sapling_destination" ] && [ ! -L "$sapling_destination" ] || fail 'Destination already exists. Choose --dir with a new folder; existing files were kept.' '目标目录已存在。请用 --dir 指定新文件夹；已有文件未修改。'
sapling_parent="$(dirname -- "$sapling_destination")"
sapling_name="$(basename -- "$sapling_destination")"
[ -d "$sapling_parent" ] || fail 'The destination parent folder must already exist.' '目标的上级文件夹必须已存在。'
sapling_parent="$(cd "$sapling_parent" && pwd -P)"
sapling_destination="$sapling_parent/$sapling_name"
cleanup() { if [ -n "$sapling_stage" ]; then rm -rf -- "$sapling_stage"; fi; }
trap 'sapling_status=$?; cleanup; exit "$sapling_status"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
sapling_stage="$(mktemp -d "$sapling_parent/.saplingagent-install.XXXXXXXX")"
say 'Resolving Saplingagent release…' '正在获取 Saplingagent release 版本…'
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 20 --max-time 120 --retry 2 \
  'https://api.github.com/repos/extendmachine/Saplingagent/git/ref/heads/release' -o "$sapling_stage/ref.json"
sapling_ref="$(cat "$sapling_stage/ref.json")"
sapling_sha_pattern='"sha"[[:space:]]*:[[:space:]]*"([a-f0-9]{40})"'
if [[ "$sapling_ref" =~ $sapling_sha_pattern ]]; then sapling_sha="${BASH_REMATCH[1]}";
else fail 'GitHub did not return a valid release commit. Retry later.' 'GitHub 未返回有效的 release 提交，请稍后重试。'; fi
say "Downloading release ${sapling_sha}…" "正在下载 release ${sapling_sha}…"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 20 --max-time 600 --retry 2 \
  "https://github.com/extendmachine/Saplingagent/archive/$sapling_sha.tar.gz" -o "$sapling_stage/source.tar.gz"
# GitHub commit archives contain one repository prefix. Reject paths outside it.
sapling_prefix="Saplingagent-$sapling_sha/"
tar -tzf "$sapling_stage/source.tar.gz" > "$sapling_stage/paths.txt"
while IFS= read -r sapling_path; do
  case "$sapling_path" in "$sapling_prefix"*) ;; *) fail 'Unexpected source archive layout.' '源码压缩包目录结构异常。' ;; esac
  case "/$sapling_path/" in */../*|*/.git/*|*\\*) fail 'Unexpected archive path.' '压缩包路径异常。' ;; esac
done < "$sapling_stage/paths.txt"
tar -tvzf "$sapling_stage/source.tar.gz" > "$sapling_stage/types.txt"
while IFS= read -r sapling_entry; do
  case "$sapling_entry" in -*) ;; d*) ;; *) fail 'Source archives must not contain links or special files.' '源码压缩包不能包含链接或特殊文件。' ;; esac
done < "$sapling_stage/types.txt"
mkdir "$sapling_stage/app"
tar -xzf "$sapling_stage/source.tar.gz" --strip-components=1 -C "$sapling_stage/app"
for sapling_file in kernel/manifest.json config/release.json install.sh Saplingagent.sh AGENTS.md FINAL_GOAL.md TODO.md AI_TASKS.md rules/README.md kernel/scripts/Saplingagent.sh kernel/scripts/launcher/recipient-records.mjs kernel/scripts/macos/bootstrap.sh kernel/scripts/windows/bootstrap.sh; do
  [ -f "$sapling_stage/app/$sapling_file" ] && [ ! -L "$sapling_stage/app/$sapling_file" ] || fail "Incomplete source: $sapling_file" "源码不完整：$sapling_file"
done
sapling_release_json="$(cat "$sapling_stage/app/kernel/manifest.json")"
sapling_version_pattern='"version"[[:space:]]*:[[:space:]]*"([0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?)"'
if [[ "$sapling_release_json" =~ $sapling_version_pattern ]]; then sapling_release_version="${BASH_REMATCH[1]}";
else fail 'Kernel version metadata is missing or invalid.' '内核版本元数据缺失或无效。'; fi
sapling_receipt_platform=universal
if [ -f "$sapling_stage/app/kernel/scripts/platform.sh" ]; then
  [ -f "$sapling_stage/app/kernel/scripts/linux/bootstrap.sh" ] || fail 'Incomplete Linux installer in this source snapshot.' '该源码快照缺少 Linux 安装程序。'
else
  # Older release launchers use host-specific receipts and do not accept --platform.
  # Restrict this compatibility path to snapshots that predate the selector.
  if grep -Fq '"kernel/scripts/platform.sh"' "$sapling_stage/app/kernel/manifest.json"; then
    fail 'Incomplete platform selector in this source snapshot.' '该源码快照缺少平台选择程序。'
  fi
  case "$(uname -s 2>/dev/null || true)" in
    Darwin) sapling_legacy_host=macos ;;
    MINGW*|MSYS*|CYGWIN*) sapling_legacy_host=windows ;;
    *) sapling_legacy_host=linux ;;
  esac
  sapling_target="$sapling_requested"
  case "$sapling_target" in ''|auto) sapling_target="$sapling_legacy_host" ;; esac
  if [ "$sapling_download_only" -eq 0 ] && [ "$sapling_target" != "$sapling_legacy_host" ]; then
    fail 'This older release installs only for the current host. Use --download-only to transfer the source.' '此旧版本仅支持为当前主机安装。可使用 --download-only 下载并转移源码。'
  fi
  case "$sapling_target" in
    macos) sapling_receipt_platform=macOS ;;
    windows) sapling_receipt_platform=Windows ;;
    linux)
      [ -f "$sapling_stage/app/kernel/scripts/linux/bootstrap.sh" ] || fail 'This release does not include a Linux installer.' '此发行版本没有 Linux 安装程序。'
      sapling_receipt_platform=Linux ;;
  esac
  sapling_has_platform=''
fi
sapling_hash() {
  if [ "$sapling_hash_command" = sha256sum ]; then sha256sum "$1"; else shasum -a 256 "$1"; fi
}
{
  printf '{"schemaVersion":2,"kernelVersion":"%s","releaseVersion":"%s","sourceRef":"release","sourceCommit":"%s","platform":"%s","initializeRecords":true,"distribution":{"source":"release-archive","gitIncluded":false},"recordHashes":{' "$sapling_release_version" "$sapling_release_version" "$sapling_sha" "$sapling_receipt_platform"
  sapling_separator=''
  for sapling_file in AGENTS.md FINAL_GOAL.md TODO.md AI_TASKS.md; do
    sapling_hash_line="$(sapling_hash "$sapling_stage/app/$sapling_file")";sapling_digest="${sapling_hash_line%% *}"
    printf '%s"%s":"%s"' "$sapling_separator" "$sapling_file" "$sapling_digest";sapling_separator=','
  done
  printf '}}\n'
} > "$sapling_stage/app/delivery.json"
# Reserve the final directory atomically; never merge into an existing installation.
mkdir "$sapling_destination" || fail 'Destination was created by another process; nothing was overwritten.' '其他进程已创建目标目录，本次未覆盖任何文件。'
# This fresh directory is owned by this invocation; include dotfiles as well.
shopt -s dotglob nullglob
mv "$sapling_stage/app/"* "$sapling_destination/"
chmod +x "$sapling_destination/Saplingagent.sh" "$sapling_destination/install.sh"
cleanup; sapling_stage=''; trap - EXIT
say "Saplingagent kernel $sapling_release_version ready: $sapling_destination ($sapling_sha)" "Saplingagent 内核 $sapling_release_version 已就绪：${sapling_destination}（${sapling_sha}）"
if [ "$sapling_download_only" -eq 1 ]; then
  if [ -n "$sapling_has_platform" ]; then
    say "Next: enter this folder and run bash Saplingagent.sh --platform $sapling_requested install." "下一步：进入该文件夹，运行 bash Saplingagent.sh --platform $sapling_requested install。"
  else
    say 'Next: enter this folder and run bash Saplingagent.sh.' '下一步：进入该文件夹，运行 bash Saplingagent.sh。'
  fi
  exit 0
fi
export SAPLING_LANG="$sapling_lang"
cd "$sapling_destination"
# Keep stdin on the terminal. The pinned launcher owns platform selection and its menu.
set -- --lang "$sapling_lang"
if [ -n "$sapling_has_platform" ]; then set -- "$@" --platform "$sapling_requested"; fi
bash ./Saplingagent.sh "$@" install <&3
say 'Finish configuration at the URL printed by setup. On Linux, then run bash Saplingagent.sh start.' '请在安装程序显示的网址完成配置。如使用 Linux，随后运行 bash Saplingagent.sh start。'
