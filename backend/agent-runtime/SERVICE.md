# Agent-runtime service

TASK-20261009-005 / Codex/root; Locally runable development version, manual experience see root TODO. Node >=24.11 (unified environment), ESM native HTTP. No third-party running dependency, rpc.mjs connects to the local official Codex CLI0.146.1 App Server.

Responsibilities: model catalog/authentication, continuous thread/turn, SSE text and tool progress, approval, cancellation, de-weighting, disconnection and restart recovery; tasks.mjs is responsible for root AI_TASKS running period registration and this service ai-tasks/runtime record. Files/commands can use Native Codex or MCP/app-builder; service implementation is still communicated through public contracts.

TASK-20261011-022 introduces a provider boundary. Codex App Server remains the default engine; `providers/opencode.mjs` owns the project-local OpenCode server and SDK client. New conversations may select a connected OpenCode provider/model, while every saved conversation remains pinned to one engine selection. Both paths reuse workspace, MCP, SSE, cancellation, runtime task attribution and Git/restart gates.

TASK-20261010-004 Add Git version reading and protected switching in this service: `git-versions.mjs` only calls the Git work tree in the project through the parameter array, without splicing the shell; read the current HEAD, branch, unsubmitted files, recently submitted and Worktree occupancy, and generate short version numbers and status fingerprints for bottom update reminders. Switching is only for existing local branches; when the current branch is changed, it will automatically temporarily save and submit all unignored files, and then switch the target. Rejected during active AI conversation, concurrent switching or the target is occupied by other Worktree. Do not create or delete branches, do not stash, force, discard files or operate remotely. If the switch is successful, only the branch and short SHA are recorded, and the file body or absolute path are not recorded.
The same module provides explicit local saving submission: when the agent has no active dialogue, all changes will not be ignored, and empty submissions will not be created when the workspace is clean. This operation does not include remote push, new branch or switch branch.

The default loopback is 4310; HTTP4311, builder4312 inside workspace; the browser is proxyed by Vite from the same source/api. Start node scripts/dev.mjs uniformly; prepare setup/workspace/builder and MCP dependency before node backend/agent-runtime/server.mjs separately. GET /health is process health, and GET /api/status.ready is model/authentication/MCP real readiness. The two are different.

The model selects the actual model/list directory, and the first choice is available, otherwise the directory defaults; the actual gpt-5.6-sol/medium of the machine has been called in real. CodeX_HOME is in local-secrets/codex; since the local auth is copied for the first time, the project auth is not covered. All authentications are only read for service, and the API does not return the account mailbox/secret value.

The user has selected Full Access: Codex danger-full-access + never, native shell/unified_exec enabled, seedagent MCP approve by default. File, backend, MCP, chat/main, dependency and configuration have no application-level protection or mandatory verification; standard execution confirmation is automatically accepted, and native files/commands can be executed. Unknown interactive data does not forge input. Chat attachments use the local upload interface described below; native question forms and external OAuth plug-ins remain unavailable; the local back-end/MCP source code can be modified, and the process needs to be restarted to load. The permission is only for the current OS user, and the root is not mentioned.

The data is atomically persistent through the workspace public interface, and the snapshot of the API event is the authoritative information. One turn per session, and request the ledger to be reweighted. Halfway page leaves without canceling the background; Stop real interruption; explicit total time limit/storage failure to stop the old turn, failure retention reason; when the disk cannot be written, the dirty snapshot in the process is retained and the failure is clear. The source recovery does not resume the chat.

TASK-20261010-006: turn-progress.mjs records the last effective progress according to a single round, and the total time limit is closed by default (turnTimeoutMs=0, the missing field is also 0). If there is no progress for 10 consecutive minutes, only a status reminder is sent. Users can wait or Stop, and the system will not automatically stop/resend. Non-empty text, reasoning, plan, tool output/progress and effective item life cycle update category and time, heartbeat/polling/reconnection/save/error retry without renewal. Only the activity round discloses the progress metadata, and the front-end does not need to be changed; do not save or broadcast the original reasoning text, command output, MCP progress text. The status of the silent tool is distinguished from the real waiting confirmation. The Full Access standard confirmation maintains automatic release, and the free question interface is not added. End, cancellation, fault and exit cleaning monitoring timer; the optional positive total time limit is still really interrupted. SEE CONTRACT/REFERENCES FOR SOURCES AND FIELDS. 39 ISOLATION TESTS HAVE BEEN PASSED. THE LONG-TERM OPERATION OF THE REAL MODEL AND MANUAL EXPERIENCE ARE TO BE ACCEPTED; IT IS NOT A BRUN-POINT CONTINUATION REALIZATION.

TASK016 Supplementary exit life cycle: After receiving SIGINT, SIGTERM or macOS terminal shutdown, stop the independent App Server process group created by this service first; if it is still alive after 750ms, upgrade SIGKILL, and wait up to 1500ms for process cleaning, do not scan or terminate other service/user processes. Try to save the end state of the session as interrupted, wait up to 2000ms with the process cleaning, and then cancel the unfinished workspace request and close the SSE/HTTP connection. Turn off the power and other operations, and the repeated signal will not skip the cleaning; do not restart the App Server during exiting. When the persistent service fails, there may still be an unfalled end of the disk. Continue to correct the legacy running state next time.

logs/agent-runtime/agent-runtime-YYYY-MM-DD.log, cross-day cleaning of ordinary logs for 30 days, only events, models, IDs, status/error categories, do not remember user text, MCP parameters/results, command output, original stderr or authentication.

Source file server/rpc/tasks/approval/permissions/turn-progress.mjs and git-versions.mjs; test test/; interface CONTRACT, deploymentDEPLOY, source REFERENCES, handover ai-tasks/TASK-20261009-005.md, TASK-20261010-004.md and TASK-20261010-006.md.

Runtime MCP calls Agent internal POST /internal/register-task before controlled changes, Bearer authenticates and binds the current App Server MCP item fingerprint. Before modification, project_context({modification:true}) tries to return taskId; read-only without registration; registration failure does not block the operation. The side effects of native operations and arbitrary commands are not guaranteed to be revoked; only when requested by the user, the snapshot is restored.

The latest task TASK-20261009-010 / Codex/root; the old TASK005 permission scheme has been replaced by this user's explicit request.

## Saplingagent name change (2026-10-09)

The product name is unified as Saplingagent, and the private package name is changed to saplingagent-*. This time, only the name and display metadata, the interface, permission, model and data structure remain unchanged; SEED_*/SEEDAGENT_*, seedagent MCP/client ID, browser session key, runtime mark and seed-* Skill ID remain compatible. For verification and test submission, please refer to the authority .worktrees/coordination/AI_TASKS.md; this article does not mean that the main has been synchronized.

## Version panel update (2026-10-11)

The panel lists historical commits with optional custom names and permits loading a selected commit in detached HEAD. Named branch tips stay unchanged by historical checkout, except an explicit pre-checkout save of pending named-branch work. Saving detached work creates a retained refs/saplingagent/saved/<sha> recovery ref; users can return to an available branch. Save version still excludes known private data, credentials and local runtime/build artifacts even when old source lacks ignore rules; explicitly staged private files return GIT_PRIVATE_FILES (409). No filesystem access restrictions are added.

Select a commit, edit Version name and choose Save name. Empty text clears its alias. Aliases are local repository metadata in the common Git directory (saplingagent/version-labels.json), survive branch changes/restarts and preserve the SHA and original subject. Names are not included in a Git push or source ZIP. A failed writer lock may require removing version-labels.json.lock only after checking that no writer is alive. Malformed labels must be repaired from backup; they are never silently overwritten.

The starting page remains chat with Git controls/footer. The earlier uncommitted clock was explicitly reverted by the user. Checkout reloads frontend source, while changed backend code/dependencies require a service restart; old commits may lack the panel, in which case git switch main from Terminal restores its source. Do not reset sessions/authentication to restore source. No new dependency or login change.

## Managed restart
The project runtime manager prepares this service using the internal contract before terminating its owned process group. Finish AI/file/Git work before Restart app or Restart backend; busy work refuses restart without interruption. Prepared services reject new mutations until release or replacement. The launcher keeps its gateway/control alive. See ../runtime-manager/CONTRACT.md and DEPLOY.md.

## Folder scope and every-turn receipt (TASK-20261011-026)

Shared Codex/OpenCode instructions and per-turn context recommend customer edits in the active folder by default, permitting explicit external-code requests with unchanged Full Access. Saplingagent maintainer development/delivery is confined to its own complete project folder. Every final conversational reply, including read-only chat, is instructed to include the eight-field completion-review receipt in the user's language. Read-only work does not register a modification; unavailable fields/checks are reported honestly. See rules/README.md version2026-10-11.1 and rule18 for the authoritative policy.

These are model instructions, not tool permissions or output rewriting. No changes to native/MCP path access, sandbox/approval policy, OpenCode external_directory permission, public API/SSE schemas or stop/error behavior. Initial/resumed Codex threads and OpenCode system prompts receive the shared policy; each turn receives it again with its active folder. Protocol tests verify delivery and unchanged Full Access. Actual model format compliance remains real-conversation validation; a stopped/failed turn before a final response does not gain a fabricated receipt. Restart is required to load this source; no automatic production restart is performed.

## Windows x64 candidate (TASK-20261011-029)

Native Windows10/11 x64 uses the shared kernel/contracts/local-process.mjs OS contract. Project Node and native executable dependencies remain local. App Server uses codex.exe with file credential storage; OpenCode uses its selected opencode.exe, local XDG data/config/cache/state. The manager and command cancellation stop only their owned live PID trees with taskkill /PID /T /F; POSIX detached process-group behavior is retained. Windows shell commands use ComSpec cmd.exe /d /s /c, regardless of an inherited Git Bash SHELL. HTTP/SSE/permissions remain unchanged, including Full Access. Windows forced termination is abrupt; finish active operations before restart, and externally detached programs or forced parent death cannot guarantee cleanup. Native Windows10 auth/model/restart acceptance is pending; current host checks are macOS/synthetic. Start with bash Saplingagent.sh in Windows Git Bash; platform guide ../../docs/windows-install.html. No actual credentials, global environment or running production processes are changed by this candidate.

TASK-20261012-003 loads the standalone setup service's public file contract for saved scheme/provider credentials. Codex Responses and OpenCode Chat/Responses/Anthropic native configurations remain local; OpenCode-only startup is supported without a Codex login. Selected default readiness and codexReady are independent; MCP status is checked through the pinned OpenCode SDK. No new dependency or permission change. Account/configuration HTTP and credential mutation belong to backend/ai-config, not this runtime. Shared transport is kernel/contracts/codex-rpc.mjs, with compatibility re-export rpc.mjs. Source checks include test/configured-engine.test.mjs; native OpenCode catalog/MCP tests use synthetic local files and no model prompt.

Claude Agent engine support: see CONTRACT.md and DEPLOY.md for the shared API profile/session binding and local runtime behavior. No changes to the minimal single-chat product scope.


TASK-20261012-011: Git version controls operate on the application's own repository root and return GIT_NOT_REPOSITORY/404 for an uninitialized child folder instead of using parent Git state. Source ZIP installation initializes customer history through the launcher; UI shows the real branch. No new HTTP fields/dependency, tool restriction or automatic Git publication.


## Empty local Git state (TASK-20261012-015)

Version reads support an unborn main without creating a commit. API head is null and recentCommits empty; a current symbolic main row is supplied for the version panel. First explicit Save version creates the first eligible source commit. Launcher local reset clears Git metadata only; API read/save never resets Git or contacts remotes. See CONTRACT.md for the compatible unborn field and nullable head.


## OpenCode reply routing (TASK-20261012-017)

OpenCode SSE carries user and assistant message parts. The adapter binds each native prompt messageID to assistant role/parentID metadata before forwarding text/tools/reasoning. It subscribes before allowing prompt submission, buffers early parts, recovers missing metadata from native message storage at idle, and deduplicates cumulative text per part. Prompt rejection and native message/session failures release run state and do not report successful conversation. Runtime context is sent in system, separate from raw user parts. Existing frontend/SSE, Full Access, local storage and engine bindings remain unchanged. Native pinned1.19.0 synthetic Chat Completions/MCP/resume/error checks are in test/opencode-messages.test.mjs; HTTP persistence coverage is in test/opencode-chat-http.test.mjs. Real customer-provider and Windows acceptance remain separate.

TASK-20261014-003: managed startup passes effective SEED_FRONT_PORT/SEED_AGENT_PORT for browser Origin checks while existing SEED_* routing targets the actual backends/MCP/OpenCode. Default configuration remains for standalone startup, including existing SEED_AGENT_PORT=0 ephemeral test behavior. Full Access and internal authentication remain unchanged.

## Attachment and page transport (TASK-20261015-012)

POST /api/attachments uploads files to workspace using opaque IDs; GET /api/attachments/:id/content streams the original bytes to previews/downloads. Chat accepts optional attachmentIds and allows file-only messages. Resolve every ID before recording a turn; retries compare text and ordered attachment IDs, preserving the original requestId and session binding. Persist public attachment metadata alongside user messages. Browser responses contain no private filesystem paths or credentials.

Codex receives native localImage inputs. OpenCode receives native file parts with image data URLs; Claude receives structured SDKUserMessage image blocks through the pinned SDK streaming-input API. Generic files are referenced by canonical local paths in explicitly untrusted metadata for native file tools; uploading does not claim Office/PDF parsing or model image support. Unsupported models and missing/corrupt storage remain real errors. Existing text-only input and provider/session selection remain compatible. No inference is sent for initialization or upload.

/api/page/heartbeat, /api/page/requests and /api/page/results proxy the current page bridge to app-builder with the existing same-origin and internal Bearer checks. No OS permission prompt, new service or token is introduced. page_read guidance tells native Agents to inspect fresh rendered results after UI changes.

## Independent kernel metadata

GET /api/kernel returns the safe installed kernel status from contracts/kernel.mjs independently of Git history/model readiness. Version0.90 remains the original baseline; a managed package displays its manifest version. No update/mutation HTTP endpoint is added. Launcher menu6 owns explicit offline maintenance; see ../../kernel/CONTRACT.md.

GET /api/release exposes only validated public distribution schema/version, independently of model readiness and Git; no source mutation. Its contract is separate from /api/kernel and /api/git.

Product0.9.2: engine SDKs/native executables now install once in kernel/node_modules. The application Agent package/lock stay customer-owned and are not overwritten by kernel upgrades. Shared resolver supports their ESM exports. No model protocol or permission change; existing optional Git API remains application code with no default UI/installer invocation.


## Chat controls and provider usage (TASK-20261019-056)

The application Agent exposes title-only conversation renaming and forwards the
current Codex turn's native context measurement through session snapshots. Workspace
persists this optional metadata. Counts are not inferred for unsupported engines,
and the Agent neither triggers compaction nor promises its timing. Per-session
rename ordering keeps active snapshots consistent without starting or stopping
inference. Existing attachments, page reading, provider bindings and Full Access
are retained. No extra service, dependency, process or persistent port is added.
See CONTRACT.md and test/chat-controls.test.mjs for shape, failure and race handling.
