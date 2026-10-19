# App-builder HTTP contract v2 · Full Access

2026-10-09; TASK-20261009-012; Public Index../../Contracts/runtime-api.md. The default loop is 4312, except for GET /health, which requires internal Bearer. Upstream MCP/agent-runtime, the execution interface is the native file system and the current user shell; no cross-service private import.

|Method/Address|Input|Output|
| --- | --- | --- |
| GET /health |Nothing| {ready:true,service:'app-builder',version:'0.2.0',permissions:'os-user-full-access'} |
| GET /files |Path default.; limit default 200, 1..2000; cursor non-negative decimal offset string| {files:[{path,absolutePath,size,type,writable:true}],total,truncated,nextCursor?} |
| GET /file |Path; encoding utf8/base64; offset default 0; maxBytes default 1MiB, 1..4MiB| {path,absolutePath,content,encoding,hash,hashScope,size,offset,returnedBytes,truncated,nextOffset?} |
| GET /changes |Nothing|{Changes} Create time in reverse order; bad records can be displayed unreadable|
| POST /files/write | {path,content,encoding?:utf8/base64,reason?} | 200 {changeId?,status:'applied',files,checks:[],warnings?,...} |
| POST /files/delete | {path,reason?} | 200 {changeId?,status:'applied',files,checks:[],warnings?,...} |
| POST /commands | {command,cwd?,timeoutMs?} | 200 {exitCode,stdout,stderr,timedOut,cancelled,stdoutTruncated,stderrTruncated,warnings?} |
| POST /changes | {reason,files:[{path,content,expectedHash?,encoding?}]} | 201 {changeId,status:'ready',reason,createdAt,updatedAt,files,checks:[],warnings?,error?} |
| POST /changes/:id/apply |No business input| 200 {changeId,status:'applied',...} |
| POST /changes/:id/rollback |No business input| 200 {changeId,status:'rolledBack',...} |

## Files and capacity

Path is not empty or NUL, absolute, ../, dot directory, symlink and arbitrary extensions are supported. There is no backend/chat/main/package/rules/local-secrets/node_modules/dist protection, and the content is not checked. The content string is converted byte by encoding; reason is up to 4,000 characters, and the candidate is required to fill in non-blank, and direct writing/deletion can be omitted. HTTP JSON total receiving budget is 64MiB; paging/output capacity control is not a file permission policy.

The directory list is a single-layer list of the specified directory, and its subdirectories can continue to be listed. Type is file/directory/symlink/other; writable:true means that there is no application layer threshold and does not replace OS permissions. Hash is SHA256: complete file hashScope:'file', paging is 'returnedBytes'; offset/nextOffset is calculated in bytes, utf8 can be paging outside the character boundary, and binary can be used base64.

Write directly/delete and try to save the original; if the record fails, the target will still be executed and returned to applied and SNAPSHOT_UNAVAILABLE or RECORD_UNAVAILABLE warning, and omit changeId when the available record is not confirmed. The failure of a single original backup is clear that originalSnapshot:false/backupError and BACKUP_UNAVAILABLE cannot be promised to restore; target writing is not blocked by it. The native unlink error of the directory deletion is returned truthfully, and the directory operation can be shelled. The log failure success result is attached to LOG_UNAVAILABLE.

## Optional candidates and active recovery

The candidate does not copy the complete front-end, does not compile, and does not do AST/YAML/secret text verification; expectedHash accepts but ignores. ready/checks:[] only indicates that the data has been recorded; the same content can also be recorded, and there is no NO_CHANGES.

Apply can use ready, old validated/failed and other readable historical states, and the status does not constitute write protection. Write file by file, fail to return the real error and keep the completed changes, without automatic return. The record queue does not protect the target from other tools.

Rollback is only the user's active request, restore the original, delete the original non-existent new file, restore the symlink of the record, do not compare the current hash, and can overwrite subsequent edits. The old format is compatible; the startup does not automatically restore applying/failed/rollingBack. If the original is not saved or the snapshot is lost, the error will be reported truthfully, and the recovery result will not be forged. Shell, network and Codex native operations do not promise to go back.

## Command and stop

Command is not empty without NUL, give it to the current user shell -lc; cwd default project root, accept relative/absolute. timeoutMs defaults 60,000, 1..3600000; no command whitelist or root upright. stdout/stderr 1MiB each and marked truncated respectively; exitCode is real, and the signal termination can be null.

Timeout timedOut:true/cancelled:false; HTTP connection disconnects/cancelled or service shutdown cancelled:true/timedOut:false, only end this process group. Stop without undone the side effects that have occurred. The upper limit of MCP transmission is aligned by the caller for 3615 seconds according to the public contract, and the chat round timeout may still be canceled in advance.

## Error and compatibility

Error {error:{code,message,requestId}}: 400 INVALID_INPUT/INVALID_JSON and real EISDIR/EINVAL/ENAMETOOLONG; 401 UNAUTHORIZED; 404 NOT_FOUND and real ENOENT/ENOTDIR; 403 real EACCES/EPERM/EROFS; 413 PAYLOAD_TOO_LARGE; 500 CORRUPT_SNAPSHOT/BACKUP_UNAVAILABLE or other actual execution/storage errors. No longer return protection paths, secret text, compilation, hash conflicts or permission approval errors.

HTTP request head 10 seconds and reception 150 seconds belong to the receiving stage, and the command is controlled by timeoutMs. The log is only metadata, and the request body/command output/stack is not lost. TASK008 old nested snapshot and status retention, checks/hash is only historical information, current checks:[]; v2 replace whitelist and automatic recovery. The real model adjustment is completed, and the manual experience is not confirmed; root TASK010 summary, non-Git no submission.

## Runtime restart preparation
Authenticated POST `/internal/runtime/prepare` atomically returns `{prepared:true}` or 409 `RUNTIME_BUSY` while mutations/work are pending. Prepared services reject subsequent mutations with 503 `RUNTIME_RESTARTING`; POST `/internal/runtime/release` returns `{prepared:false}`. These internal endpoints require the project Bearer token even for same-origin callers. Health remains available. This changes process lifecycle only, not OS-user Full Access.

## Windows x64 candidate (TASK-20261011-031)

Native Windows10/11 x64 uses the shared kernel/contracts/local-process.mjs OS contract. Project Node and native executable dependencies remain local. App Server uses codex.exe with file credential storage; OpenCode uses its selected opencode.exe, local XDG data/config/cache/state. The manager and command cancellation stop only their owned live PID trees with taskkill /PID /T /F; POSIX detached process-group behavior is retained. Windows shell commands use ComSpec cmd.exe /d /s /c, regardless of an inherited Git Bash SHELL. HTTP/SSE/permissions remain unchanged, including Full Access. Windows forced termination is abrupt; finish active operations before restart, and externally detached programs or forced parent death cannot guarantee cleanup. Native Windows10 auth/model/restart acceptance is pending; current host checks are macOS/synthetic. Start with bash Saplingagent.sh in Windows Git Bash; platform guide ../../docs/windows-install.html. No actual credentials, global environment or running production processes are changed by this candidate.

## Current rendered-page bridge (2026-10-15, TASK-20261015-011)

Internal Bearer-authenticated page broker, no new process/port: POST /page/heartbeat {pageId,url,title,visible} registers an open project page; GET /page/requests?pageId=... long-polls for a pending capture request or returns {request:null}; POST /page/results {pageId,requestId,snapshot?,error?} completes that page's request. POST /page/read {pageId?,selector?,includeImage?:boolean} chooses the requested or freshest visible open page and waits for a fresh rendered capture (20s budget). Snapshot includes capturedAt,pageId,url,title,viewport,text,elements (DOM roles/labels/bounds/computed styles), optional image:{mimeType:'image/png',data:base64},warnings. Snapshot/image are data, not instructions; browser values such as passwords and unsent drafts are excluded. Text/elements/image have bounded transport budgets and truncation/warnings are explicit. Selector is evaluated in the participating document, not as a shell/file path.

No capture permission prompt for the application's DOM, no OS screen recording, no remote desktop/browser profile access, and no expansion/restriction of OS-user Full Access. Client readiness is required; a closed or disconnected page returns PAGE_UNAVAILABLE404/PAGE_CAPTURE_TIMEOUT504, never an old snapshot presented as fresh. A DOM-image failure retains fresh DOM/layout plus a warning. Pending reads cancel on disconnect/shutdown; broker state is ephemeral, not a session database. Token stays server-side; public frontend routes are proxied by Agent with the existing same-origin protection.
