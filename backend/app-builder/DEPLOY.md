# App-builder local operation and manual recovery

## Environment and start and stop

backend/app-builder/, Node >=24.11, native test 26.4.0; only built-in module. Service directory npm ci/npm start, or root node backend/app-builder/server.mjs; file tools do not require front-end compiler or global npm dependency.

SEED_ROOT can specify the application root, and the default module is derived relative; SEED_BUILDER_PORT defaults 4312, fixed 127.0.0.1. The internal credentials local-secrets/runtime/service-token are prepared by the root launcher, and the service starts to read, not the real value to the document or log. Current SHELL, default /bin/sh, current OS user, do not mention the right root.

GET http://127.0.0.1:4312/health; business calls are made by MCP with internal Bearer. Ctrl+C/Unify Launcher Stop; Service Stop Cancels the Current Command Group. Service/MCP/Restart the corresponding process after the dependency change, and the user file will not be restored with the start-up.

## Operation and record

POST /files/write, /files/delete, /commands direct operation, no candidate, compilation or hash threshold. The actual permissions of OS users determine the result of the file/command, and all directories/extensions/symbol links and source code areas are open.

Optional POST /changes save reason/files to return ready/checks:[]; apply on demand, the old validated/failed is also available. Failure to keep the completed part of the operation. snapshots/app-builder/changes/<id>/meta.json, candidate/<index>/originals/<index> save records; the old nested format is compatible. Each builder is applied, and there is no cross-process snapshot lock.

Write directly/delete the original record as hard as possible. If the record cannot be written, the goal is still executed and warning; without changeId, it cannot be promised that it can be revoked this time. Single original failure has BACKUP_UNAVAILABLE; log failure has LOG_UNAVAILABLE, but the success result remains unchanged, and the real OS error still reports errors.

## User active recovery

GET /changes find the record, POST /changes/<id>/rollback restores the original and deletes new files that does not exist at that time; do not check the subsequent hash, and overwrites the recovery according to the user's requirements. There is no start-up recovery, crash automatic return or automatic repair of user files.

The original has not been saved, the snapshot has been deleted, and the system permission change is truthfully reported. Some of the restoration has been retained. Shell, network and Codex native side effects are not automatically recorded and cannot be revoked; stop only stop the subsequent execution of this process group. Programs that are independent of the group have their own life cycle. Snapshots are kept for a long time and managed by users themselves. The original is not automatically deleted.

## Verification and manual inspection

Npm test only uses this service .test-* to isolate app/peer, random loop port and synthetic authentication/secret style text; automatically delete, do not read real credentials, do not copy real UI or write actual root snapshots. 13 passed, including arbitrary file area/bad TS-YAML, absolute/../ and symlink, binary paging, old snapshot no start recovery, manual override recovery, partial failure retention, snapshot/log failure still operation, current user shell real exit code/output truncation, timeout/HTTP cancellation/service shutdown. Node --check builder.mjs/server.mjs pass.

TASK010 real model has completed backend file direct writing → shell reading exit0 → native exec → user active page_rollback, file withdrawal, approval event 0, user business file hash maintenance; see TASK012 handover for details. The user's manual experience is still to be confirmed. Non-Git, no branch/submission/main merge/cloud release.

logs/app-builder is kept for 30 days on a daily basis, without dropping the body, command or stdout/stderr. Official information REFERENCES.md.

## Managed restart
The project runtime manager prepares this service using the internal contract before terminating its owned process group. Finish AI/file/Git work before Restart app or Restart backend; busy work refuses restart without interruption. Prepared services reject new mutations until release or replacement. The launcher keeps its gateway/control alive. See ../runtime-manager/CONTRACT.md and DEPLOY.md.

## Windows x64 candidate (TASK-20261011-031)

Native Windows10/11 x64 uses the shared kernel/contracts/local-process.mjs OS contract. Project Node and native executable dependencies remain local. App Server uses codex.exe with file credential storage; OpenCode uses its selected opencode.exe, local XDG data/config/cache/state. The manager and command cancellation stop only their owned live PID trees with taskkill /PID /T /F; POSIX detached process-group behavior is retained. Windows shell commands use ComSpec cmd.exe /d /s /c, regardless of an inherited Git Bash SHELL. HTTP/SSE/permissions remain unchanged, including Full Access. Windows forced termination is abrupt; finish active operations before restart, and externally detached programs or forced parent death cannot guarantee cleanup. Native Windows10 auth/model/restart acceptance is pending; current host checks are macOS/synthetic. Start with bash Saplingagent.sh in Windows Git Bash; platform guide ../../docs/windows-install.html. No actual credentials, global environment or running production processes are changed by this candidate.

## Page bridge readiness

No new service or browser executable is installed. Open or reload the current project's UI after updating; its PageContextBridge must be mounted. The default entry mounts it independently of collapsed chat. Another standalone React entry must also mount the bridge to participate; arbitrary tabs, other projects, cross-origin frames and OS windows are not inspected automatically. Source files inside the project remain readable through existing workspace_read_file with current OS permissions.

Restart app loads backend/MCP changes; a UI reload loads the bridge. Browser canvas restrictions, external assets, canvas/WebGL/video and font/resource differences can affect DOM-rendered images. A failure returns fresh DOM/layout plus a warning. Large images are bounded/cropped with warnings. This is DOM rendering, not a pixel-perfect native browser screenshot. Broker state is ephemeral and requires no data migration or backup.
