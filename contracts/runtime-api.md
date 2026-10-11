# Local operation public contract v2 · Full Access

TASK-20261009-010 to 013; 2026-10-09. The user explicitly cancels the Saplingagent MCP protection, and it is currently the full file/command permission. HTTP service agent4310/workspace4311/app-builder4312 still listens to 127.0.0.1 and uses local Bearer to distinguish internal services; the browser is the same source/api agent and does not hold the token. There is no cross-service private import.

## Current execution authority

Codex sandbox danger-full-access, approvePolicy never; seedagent MCP default_tools_approval_mode approve. At present, the files/networks/commands that can be accessed by OS users can be used, and the rights are not mentioned as root. No MCP directory, extension, backend/chat/main/rules or symbolic link protection; support absolute and project relative paths. Compilation/candidate/hash is not a write threshold; it does not automatically revert. The initial single-page chat remains as it is, and users can request to modify any components, back-end, MCP and Skills.

## Front-end -> agent

GET /api/status -> {ready,authenticated,provider,model,skills:[{name,description}],mcp:{ready,tools:[{name,description}]},permissions:{mode:'full-access',sandbox:'danger-full-access',approvalPolicy:'never',mcpApproval:'approve'},error?}。
GET /api/git -> {git:{repository,branch,detached,head:{shortSha,sha,committedAt,subject},version,fingerprint,clean,changeCount,changes,changesTruncated,branches,recentCommits}}. `version` is the current visible short version number, and `fingerprint` is used to detect whether to submit or not submit modifications on the same browser page; read the branches, submissions, unsubmitted files, local branches and other Worktree occupation status of the current project Worktree, and do not access the network.
POST /api/git/commit -> {git}. Temporarily store the source changes of the current branch or detached version and create a local submission; when the work area is clean, the power will return to the current state. Return 409 when AI dialogue is running or other Git writing operations are in progress; do not push remote.
POST /api/git/switch {branch} -> {git,reloadRecommended:true}. Only existing local branches are accepted; the current named branch will be automatically submitted when there are unsubmitted changes, and 409 will be returned when the AI dialogue is running, another switch is in progress or the target branch is occupied by other Worktree. The interface does not perform stash, force, discard, fetch, pull, push or remote branch creation.
GET /api/sessions -> {sessions:[{id,title,updatedAt}]}。
GET /api/sessions/:id -> {session:{id,title,threadId,messages,updatedAt,running,activeRequestId,requests,pendingApprovals:[],progress?}}。
POST /api/chat {sessionId?,text,requestId?} -> SSE: session, snapshot, text_delta, status, tool, error, done; reserve compatibility with approval events and POST /api/approvals/:id, but the local permission/MCP performs automatic release, and no confirmation is required.
POST /api/sessions/:id/cancel -> {ok:true}; GET /api/events? sessionId=... -> snapshot+follow-up SSE. Running disconnection will not stop automatically. Session persistence, request deduping, real cancellation/error status maintenance. Stop cannot undo the side effects of documents or commands that have been generated.

TASK-20261010-006: optional `progress` exists only for an active turn. It contains startedAt/lastProgressAt (ISO timestamps), lastProgressKind (started/text/reasoning/plan/command-output/file-output/mcp-progress/item-started/item-completed), idle (boolean), and phase (working/tool-running/waiting-user). This is Agent memory metadata, not persisted in workspace; it exposes no output, reasoning or tool parameters and is omitted after completion. turnTimeoutMs defaults to 0, including when absent; turnIdleWarningMs defaults to 600000. Warn once per period without effective progress via status.label; retain running, send no error/done, and never automatically resend. Progress resumes the run normally; reconnection replays the current reminder. Silent tools may still be running. Full Access approvals remain automatic; no new free-form question interface is introduced. Heartbeats, polling, reconnection, saves and connection retries are not progress; stale thread/turn events cannot extend timers. An explicitly positive total deadline still interrupts. Both settings accept only integer milliseconds in 0..2147483647; 0 disables the respective timer.

## MCP -> agent running record

POST /internal/register-task {tool,fingerprint} -> {taskId:'RUN-<requestId>'}. Bearer internal call, bind the current active MCP call to record the attribution. project_context({modification:true}) and the modification tool try to register; registration is not used as a permission threshold, fail to warn the metadata and continue to operate, do not forge taskId. Ordinary chat/read-only without registration. The MCP configuration transmits the project root and port through explicit env.

## agent/MCP -> workspace

GET /health，GET /sessions -> {sessions}；POST /sessions {title?} -> {session}；GET /sessions/:id -> {session}；PATCH /sessions/:id {threadId?,messages?,title?,running?,activeRequestId?,requests?,expectedRevision?} -> {session}。
GET /preferences -> {preferences:[]}; POST /preferences {key,value,evidence} -> {preference}; DELETE /preferences/:id -> {ok:true}. Prefer to retain the user's original words based; workspace business schema does not belong to MCP path permission filtering.

## MCP -> app-builder

GET /health -> {ready,service,version}。
Get/files? Path=.&limit=200&cursor=0 -> {files:[{path,size,type,writable:true}],truncated,nextCursor,...}. Support any file directory; paging is a response capacity control, not rejected by the protection path.
Get/file? path=...&encoding=utf8|base64&offset=0&maxBytes=1048576 -> {path,content,encoding,hash,hashScope,size,offset,nextOffset,truncated,...}; maxBytes up to 4MiB, reading paging is not a path permission restriction.
POST /files/write {path,content,encoding?:'utf8'|'base64',reason?} -> {changeId?,status:'applied',warnings?,...}: Write the file directly and try your best to record the original for manual revocation of the snapshot; failure is still written, and you can't promise recovery when warning and there is no available changeId.
POST /files/delete {path,reason?} -> {changeId?,status:'applied',warnings?,...}: Delete the file and try your best to record the original; snapshot failure does not prevent deletion, directory operation can use shell.
POST /commands {command,cwd?,timeoutMs?} -> {exitCode,stdout,stderr,timedOut,cancelled,stdoutTruncated,stderrTruncated,...}: Current user shell, no command whitelist; default cwd project, supports other working directories. The default is 60 seconds, and up to 1 hour can be specified; real exit code, timeout and cancellation, stdout/stderr outputs the upper limit of 1MiB respectively and explains the truncation, and does not drop the body. HTTP disconnection/request cancellation/service shutdown will stop this tool command and cannot undo the side effects that have occurred. The maximum limit of MCP request is 3615 seconds; the chat default is that there is no hard time limit for the whole round. Idle is only a reminder, and the time limit of the tool itself is still valid.
POST /changes {files:[{path,content,expectedHash?,encoding?}],reason} -> {changeId,status:'ready',checks:[],...}: Optional candidate records, do not compile, do not perform AST/YAML/secret text verification, expectedHash does not block writing.
POST /changes/:id/apply -> {changeId,status:'applied',...}; Compatible with the old validated/failed candidate, the actual file system error is returned truthfully.
POST /changes/:id/rollback -> {changeId,status:'rolledBack',...}: Only the user takes the initiative to request, do not intercept subsequent modifications, and restore according to the original. GET /changes -> {changes}.

File/deleted originals and records are in snapshots/app-builder; direct writing of commands and Codex native can produce unrecorded side effects, and cannot promise a complete return. Service startup does not automatically revert unfinished user operations. Data corruption, insufficient system permissions or non-existence of files are actual errors, not application permission policies.

## MCP catalog

Keep workspace_list_files/read_file, project_context, page_propose/apply/rollback/changes, preferences_get/set/forget, skills_list/read; add workspace_write_file, workspace_delete_file, workspace_run_command, a total of 15 tools. Skills is a modify project process. The legal frontmatter is a Codex discovery format and is not used as MCP write protection. Executable MCP source code and dependency can be directly modified; the running process needs to be restarted to load the source code changes.

## Historical versions and custom labels (2026-10-11)

GET /api/git?limit=25 returns named branches and recentCommits (25 by default, integer 1..500), historyTruncated, and optional displayName on head/commit entries. Local custom names are keyed by full SHA and stored atomically in the repository common Git directory: saplingagent/version-labels.json. They survive branch changes/restarts and are not commit subjects or remotely published metadata. A malformed store returns GIT_LABELS_INVALID instead of being overwritten.

POST /api/git/label {sha,name}: sha must be an existing full 40/64-character hexadecimal commit ID; name is trimmed, maximum 80 characters, with control characters rejected. Empty name clears the alias. Returns {git}. Writes are serialized and a repository label-file lock rejects concurrent writers (GIT_LABEL_BUSY,409). Names may use the user's language.

POST /api/git/checkout {sha} loads an existing historical commit into detached HEAD, leaving main/testcode/release tips unchanged. Before checkout/switch, pending nonignored work is committed; detached commits are retained under refs/saplingagent/saved/<sha>. Branch switching now also works from detached HEAD, and POST /api/git/commit can save detached work under that recovery ref. All operations remain local, without force/reset/push. Historical code may lack this panel; use git switch main from Terminal to return. Browser reload changes frontend source; backend/dependency changes require a service restart. Ignored credentials and session data remain outside Git checkout.

Agent rejects mutations during active AI (GIT_AGENT_BUSY), concurrent Git mutation (GIT_SWITCH_BUSY), and starting a new chat during a Git mutation. Invalid/missing commit errors use GIT_INVALID_VERSION/GIT_VERSION_NOT_FOUND. Label I/O failure uses GIT_LABELS_INVALID/GIT_LABEL_BUSY or the existing internal error path.

Saving versions excludes known private/runtime artifacts even if historical ignore rules are absent; GIT_PRIVATE_FILES (409) rejects already staged private paths. History is bounded to 500 commits per read; older versions can also be loaded by a full commit ID through the API.
