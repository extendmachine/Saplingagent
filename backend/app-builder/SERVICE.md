# App-builder service description

- Catalog backend/app-builder/; Codex/workspace, TASK-20261009-012; version 0.2.0.
- Current status: Realization, 13 isolation self-examination and real model joint adjustment completed, waiting for manual experience. Root TASK010 summary, non-Git, no submission/main synchronization.
- Responsibilities: Complete file and command operations of the current operating system user, optional candidate records and active recovery of the user according to the user's requirements. The model, session and MCP protocol are coordinated by other services through public HTTP respectively.
- At present, there is no read and write whitelist, extension, symbolic link/border, secret text, AST/YAML, fixed chat/entrance/back-end/rules protection, no forced compilation, hash conflict interception or automatic recovery. Don't mention the right root.

## Structure and operating environment

builder.mjs: native read and write, index snapshot, active recovery, shell life cycle. server.mjs: HTTP/loopback/Bearer authentication, metadata log. test/builder.test.mjs: isolated regression. package.json/package-lock.json belongs to this service.
The old source-references.mjs and Babel/css-tree/yaml dependencies have been removed. Node >=24.11, native test 26.4.0, only uses Node's built-in module, no third-party running dependency, no need for front-end compiler to start file tools, and does not use global npm installation.

Root execution node backend/app-builder/server.mjs, or service directory npm start; service directory can be npm ci. The default is 127.0.0.1:4312; SEED_BUILDER_PORT covers the port; SEED_ROOT covers the project root, and the default module is derived relative. GET /health; Ctrl+C or the unified launcher stops. Shell takes the current environment SHELL. When it is not set, macOS/Linux is /bin/sh, inheriting the current service user and environment.

## Files, records and recovery

The relative path is based on the project root, and the absolute path, ../, dot directory and symbolic links are processed according to the native file system. The file supports utf8/base64 and byte paging; the directory list retains the directory/symlink/other type. Writable:true means that there is no write threshold for the service, and the actual permissions are determined by the OS.

POST /files/write, /files/delete directly operate the target and try your best to record the original. If the snapshot or record fails, the executable target is still executed, and the applied+warning is returned; changeId is omitted when the available record is not confirmed. The original backup failure clearly specifies originalSnapshot:false/backupError and BACKUP_UNAVAILABLE, and the file cannot be promised to be restored. Any shell can be used for directory operations.

Optional POST /changes successfully only returns ready/checks:[], expectedHash accepts but ignores, does not copy the complete front-end or compile. Apply is compatible with the old validated/failed candidate; multiple files fail halfway to keep the completed operation. Single-process recording queue, no cross-process snapshot lock.

snapshots/app-builder/changes/<uuid>/save meta.json, candidate/<index> and originals/<index>, absolutely and.../The target does not change the snapshot's own layout; the old nested path record retains compatibility. Only explicit rollback restores and deletes new files that did not exist at that time according to the original, allowing subsequent edits to be overwritten. The startup does not explain the applying/failed status and automatically restores the file, and the snapshot is not automatically deleted.

## Command life cycle

POST /commands execute the current user shell, no command whitelist or root elevation. Cwd default project root, can access the directory at will; the default is 60 seconds, timeoutMs 1..3600000. stdout/stderr each up to 1MiB and marked truncation; return the real exitCode, timedOut, canceled.

Timeout, HTTP request cancellation/disconnection and server.close end the shell process group created this time, and other command groups remain running. Stop cannot undo the side effects that have occurred; shell and Codex native operations do not automatically enter the file snapshot. Programs that are independent of the process group follow their own life cycle and do not promise a complete return.

## Logs and dependencies

logs/app-builder/app-builder-YYYY-MM-DD.log; start and cross-day cleaning 30 days ago logs; info/warn/error. Only requestId/changeId/status/code/exitCode/timedOut/cancelled, do not drop input, command body, output or credentials. The log cannot be written without changing the result of the completed operation, with LOG_UNAVAILABLE; the real file system error is still returned. The real log does not enter Git.

Upstream backend/mcp-runtime through HTTP; root launcher prepares local-secrets/runtime/service-token, this service starts reading for internal authentication, and the browser does not hold token. No cross-service private import or database dependence.

Interface CONTACT.md; Deployment/Active Recovery DEPLOY.md; Official Source REFERENCES.md; Current Handover ai-tasks/TASK-20261009-012.md. The old TASK008 is a historically controlled scheme, and the current v2 has been replaced. Root AI_TASKS/TODO is only updated by the coordinator.

## Saplingagent name change (2026-10-09)

The product name is unified as Saplingagent, and the private package name is changed to saplingagent-*. This time, only the name and display metadata, the interface, permission, model and data structure remain unchanged; SEED_*/SEEDAGENT_*, seedagent MCP/client ID, browser session key, runtime mark and seed-* Skill ID remain compatible. For verification and test submission, please refer to the authority .worktrees/coordination/AI_TASKS.md; this article does not mean that the main has been synchronized.

## Managed restart
The project runtime manager prepares this service using the internal contract before terminating its owned process group. Finish AI/file/Git work before Restart app or Restart backend; busy work refuses restart without interruption. Prepared services reject new mutations until release or replacement. The launcher keeps its gateway/control alive. See ../runtime-manager/CONTRACT.md and DEPLOY.md.

## Windows x64 candidate (TASK-20261011-031)

Native Windows10/11 x64 uses the shared kernel/contracts/local-process.mjs OS contract. Project Node and native executable dependencies remain local. App Server uses codex.exe with file credential storage; OpenCode uses its selected opencode.exe, local XDG data/config/cache/state. The manager and command cancellation stop only their owned live PID trees with taskkill /PID /T /F; POSIX detached process-group behavior is retained. Windows shell commands use ComSpec cmd.exe /d /s /c, regardless of an inherited Git Bash SHELL. HTTP/SSE/permissions remain unchanged, including Full Access. Windows forced termination is abrupt; finish active operations before restart, and externally detached programs or forced parent death cannot guarantee cleanup. Native Windows10 auth/model/restart acceptance is pending; current host checks are macOS/synthetic. Start with bash Saplingagent.sh in Windows Git Bash; platform guide ../../docs/windows-install.html. No actual credentials, global environment or running production processes are changed by this candidate.

## Fresh rendered-page inspection (TASK-20261015-011)

page-broker.mjs coordinates the already open project frontend through authenticated HTTP. It keeps only ephemeral heartbeats and pending requests, selects the freshest visible participating page and waits for a new capture. It neither launches a browser nor captures the OS desktop. DOM, visible text, element bounds/computed styles and optional DOM-rendered PNG are returned. Page content is untrusted data. Reading this application's DOM uses its existing access and requires no additional screen-recording permission.

A closed/disconnected page is unavailable or times out; no stored screenshot is substituted. At most 16 pages and 32 pending captures, 20-second read deadline, 12-second polling and 30-second heartbeat expiry. Pending reads cancel on disconnect/shutdown. Same-origin Agent proxy keeps the internal token out of JavaScript.
