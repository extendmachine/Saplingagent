#!/bin/sh
# Runs from a private project sibling; never executes project-local Node until after move.
set -eu
job_dir=$1
cd "$job_dir"
field() { /usr/bin/osascript -l JavaScript "$job_dir/offline-move.js" "$job_dir" field "$1"; }
source_root=$(field previousRoot)
target_root=$(field targetRoot)
node_relative=$(field nodeRelative)
parent_pid=$(/usr/bin/osascript -l JavaScript "$job_dir/offline-move.js" "$job_dir" pid)
job_id=$(field id)
no_open=$(field noOpen)
case "$parent_pid" in ''|*[!0-9]*) exit 1;; esac
: > "$job_dir/waiting"
cleanup() { cd "$(dirname "$job_dir")"; /usr/bin/osascript -l JavaScript "$job_dir/offline-move.js" "$job_dir" cleanup >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
count=0
while kill -0 "$parent_pid" 2>/dev/null; do
  [ ! -f "$job_dir/cancel" ] || exit 1
  count=$((count+1))
  if [ "$count" -gt 300 ]; then
    printf '{"schemaVersion":1,"id":"%s","phase":"failed","error":{"code":"PROJECT_STOP_PENDING","message":"Management did not exit. Close this project and inspect the setup restart lease before retrying."}}\n' "$job_id" > "$source_root/.runtime/setup-finalization.json"
    error_page=$(/usr/bin/osascript -l JavaScript "$job_dir/offline-move.js" "$job_dir" failure PROJECT_STOP_PENDING 2>/dev/null) || true
    cd "$(dirname "$job_dir")"
    [ "$no_open" = true ] || [ -z "${error_page:-}" ] || /usr/bin/open "$error_page" >/dev/null 2>&1 || true
    exit 1
  fi
  /bin/sleep 0.2
done
[ ! -f "$job_dir/cancel" ] || exit 1
failure=''
if ! /usr/bin/osascript -l JavaScript "$job_dir/offline-move.js" "$job_dir" move >/dev/null 2>&1; then
  failure=PROJECT_RENAME_FAILED
fi
if [ -d "$target_root" ] && [ ! -d "$source_root" ]; then current_root=$target_root; else current_root=$source_root; fi
# Resume opens project logs only after the folder operation is complete.
resume_failed=''
if [ -n "$failure" ]; then
  "$current_root/$node_relative" "$current_root/kernel/launcher/resume-setup.mjs" "$job_id" "$failure" >/dev/null 2>&1 || resume_failed=1
else
  "$current_root/$node_relative" "$current_root/kernel/launcher/resume-setup.mjs" "$job_id" >/dev/null 2>&1 || resume_failed=1
fi
if [ -n "$resume_failed" ]; then
  error_page=$(/usr/bin/osascript -l JavaScript "$job_dir/offline-move.js" "$job_dir" failure PROJECT_RESUME_FAILED 2>/dev/null) || true
  cd "$(dirname "$job_dir")"
    [ "$no_open" = true ] || [ -z "${error_page:-}" ] || /usr/bin/open "$error_page" >/dev/null 2>&1 || true
fi
