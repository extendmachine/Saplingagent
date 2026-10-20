# Agent Open HTTP v2 · Full Access

Task 010, replacing the permission policy in 005; the complete field is contracts/runtime-api.md as the shared contract, and the browser is the same source/api agent. GET /health distinguishes between process healthy and agentReady; GET /api/status returns ready/authenticated/provider/model, permissions(full-access/danger-full-access/never/approve), project Skills and MCP real tool directory, and does not return token.

TASK-20261011-022 adds `GET /api/engines` and immutable per-session `engine/providerId/modelId`. `POST /api/chat` accepts those fields only when creating or confirming a session selection. Codex preserves the existing RPC path; the setup-selected engine is the UI default, with Codex as the legacy HTTP default when omitted. OpenCode is independent, uses its official SDK/server API, emits the existing SSE event shapes only after the request/session state has persisted, and has no silent fallback. Provider credentials and the local server password are never part of this HTTP API.

TASK-20261010-004 New Git version interface. GET /api/git returns the current repository name, branch or detached status, HEAD, `version` short version number, `fingerprint` current status fingerprint, work area changes (up to 100 items and mark truncation), local branches, recent submissions (25 by default) and the status of branches occupied by other Worktree. When it is clean, the version number is short SHA, and when there is a change, a fingerprint summary is added; the fingerprint is used to detect page status changes, not a security signature. POST /api/git/switch {branch} only switches to local branches that already exist and are not occupied by other Worktrees; if the current named branch is changed, first stage nonignored source changes excluding private runtime files and automatically submit with `chore: save <current> before switching to <target>`, and then switch the target branch. Return 409 during active Agent dialogue, concurrent switching or target Worktree occupation. The interface does not create/delete branches, does not automatically stash, force/discard, remote fetch/pull/push; after success, the front-end should reload the target version. USE GIT_NOT_REPOSITORY, GIT_INVALID_BRANCH, GIT_BRANCH_NOT_FOUND, GIT_BRANCH_IN_USE, GIT_AGENT_BUSY, GIT_SWITCH_BUSY OR GIT_COMMAND_FAILED.

POST /api/git/commit is used for "save submission" in the upper right panel: execute `git add --all` and create `chore: save <branch> from Saplingagent` local submission when there are changes in the current work area, return the new Git status and `savedCommit`; do not repeat the submission when it is clean. AI dialogue, other Git writing operations will be rejected; push, fetch or any remote operations will not be performed.

GET /api/sessions list; GET /api/sessions/:id returns session, including messages, threadId, running, activeRequestId, requests and pendingApprovals. POST/api/chat {sessionId?,text,requestId?} SSE; requestId only accepts alphanumeric underscore hyphens, up to 100, text1..32000 characters. For the first time without sessionId, check the old session by requestId to avoid the network retrying and creating it again. The same requestId is different text409; concurrently send the same session other requestId409, complete the request to replay snapshot+done.

TASK-20261010-006 (2026-10-10): The Public Session Of The Activity Round Can Additionally Include The Optional `progress:{startedAt,lastProgressAt,lastProgressKind,idle,phase}`; The Two Are ISO Time, Kind Is started/text/reasoning/plan/command-output/file-output/mcp-progress/item-started/item-completed, idle Is Boolean, Phaseworking/Tool-Running/Waiting-User. Only the current process activity round is provided, omitted after the end, do not modify the workspace storage schema, does not mean breakpoint continuation; do not return the original source of reasoning, command output or MCP parameters. Existing callers can ignore the new fields.

By default, `turnTimeoutMs:0` (the missing field is also 0) closes the whole round of hard time limit; `turnIdleWarningMs:600000` runs through the existing `status:{label}` reminder when there is no effective progress for 10 consecutive minutes, running and maintains running, no error/done, no automatic stop, no automatic resend. Each idle is only reminded once, and the new progress is cleared idle and prompted to continue; GET /api/events and the same request reconnect and reissue the current idle/real waiting state. SSE heartbeat, HTTP polling/reconnection, save, connection error retry does not update the progress. The thread and the wheel ID are strictly matched (the ID of turn/started and completed is params.turn.id); the processing notification is suspended until the turn/start response is confirmed, and the old round event will not update the progress or end the new round.

Effective progress is non-empty text/reasoning/plan delta, different non-empty plan updates, item start/end with valid ID and known types (repeating life cycle de-weighting), non-empty command output or MCP progress.message. Only save the category and time; the silent tool will prompt that it is still running to the idle threshold. Compatible with manual approval, it is marked as waiting-user when it is really waiting to be answered; the Full Access standard is confirmed to be passed automatically, and it is not faked to be a waiting user. Non-confirmed freedom issues are still clearly rejected according to the existing ability. Stop retain the real turn/interrupt. The explicit positive value turnTimeoutMs is still the absolute total time limit. After arrival, it is really interrupted and fails; the two configurations only accept 0..2147483647 integer milliseconds, 0 closes the corresponding timer respectively, and rejects when the illegal value starts.

SSE event session, snapshot, text_delta(itemId=persistent assistant message id), status, tool, approve, error, done. GET/api/events? sessionId subscribes to the current snapshot and future increments; 15s heartbeat; the done status is only completed/failed/interrupted; the final state after saving confirmation. Multiple connections are allowed, and the turn is not canceled because a single connection is closed.

POST /api/sessions/:id/cancel calls real interrupt, cancel the model request before starting; 5s RPC failure can be retried. POST /api/approvals/:id {decision:accept|decline} retains the existing compatible interface; the current standard MCP execution confirmation and native file/shell approval are automatically allowed, and the confirmation form is not pushed one by one. Non-confirmed issues that require real data are still not forged.

The internal workspace interface uses the local token file and does not store privately across services; the runtime task index is a coordination contract, and only maintains the root AI_TASKS independent tag block, the last 50 indexes and the details of this service. Index write conflict record warning; record failure is not used as the operation permission threshold. The source code tool allows all directories, and the user's current authorization decides the action.

No CORS, Host loop restriction, reject unknown Origin/cross-site, browser POST needs to be the same source; non-browser POST must be internal Bearer. Error {error:{code,message}}, 400 input/format, 401 internal call authentication, 403 cross-site/Host, 404 does not exist, 409 busy/re-re-conflict, 503 is not ready. During the operation, the error is output through SSE, and it does not pretend to be successful.

The continuous inability to write the disk may lead to the end of the disk; dirty snapshots are limited to recovery within the same process, and restarting according to the disk status will leave the inProgress mark interrupted. Thread actually rolls out to the project CODEX_HOME, and the local message body to workspace; MCP does not set up a directory whitelist; the log/reply does not show real secrets according to the project rules, and the read tool will not automatically scan the credentials.

The running MCP calls Agent's internal POST /internal/register-task before the actual change, and Bearer authenticates and binds the current App Server MCP item fingerprint. Before modification, project_context({modification:true}) tries to return taskId; read-only without registration; continue after the callback failure warning. The new tool workspace_write_file/delete_file/run_command can also be recorded. All thread/start/resume use danger-full-access and never, and the old dialogue receives the latest permission instructions every round to avoid the old rejection boundary from continuing to take effect.

## Historical versions and custom labels (2026-10-11)

GET /api/git?limit=25 returns named branches and recentCommits (25 by default, integer 1..500), historyTruncated, and optional displayName on head/commit entries. Local custom names are keyed by full SHA and stored atomically in the repository common Git directory: saplingagent/version-labels.json. They survive branch changes/restarts and are not commit subjects or remotely published metadata. A malformed store returns GIT_LABELS_INVALID instead of being overwritten.

POST /api/git/label {sha,name}: sha must be an existing full 40/64-character hexadecimal commit ID; name is trimmed, maximum 80 characters, with control characters rejected. Empty name clears the alias. Returns {git}. Writes are serialized and a repository label-file lock rejects concurrent writers (GIT_LABEL_BUSY,409). Names may use the user's language.

POST /api/git/checkout {sha} loads an existing historical commit into detached HEAD, leaving main/testcode/release tips unchanged. Before checkout/switch, pending nonignored work is committed; detached commits are retained under refs/saplingagent/saved/<sha>. Branch switching now also works from detached HEAD, and POST /api/git/commit can save detached work under that recovery ref. All operations remain local, without force/reset/push. Historical code may lack this panel; use git switch main from Terminal to return. Browser reload changes frontend source; backend/dependency changes require a service restart. Ignored credentials and session data remain outside Git checkout.

Agent rejects mutations during active AI (GIT_AGENT_BUSY), concurrent Git mutation (GIT_SWITCH_BUSY), and starting a new chat during a Git mutation. Invalid/missing commit errors use GIT_INVALID_VERSION/GIT_VERSION_NOT_FOUND. Label I/O failure uses GIT_LABELS_INVALID/GIT_LABEL_BUSY or the existing internal error path.

Saving versions excludes known private/runtime artifacts even if historical ignore rules are absent; GIT_PRIVATE_FILES (409) rejects already staged private paths. History is bounded to 500 commits per read; older versions can also be loaded by a full commit ID through the API.

## Runtime restart preparation
Authenticated POST `/internal/runtime/prepare` atomically returns `{prepared:true}` or 409 `RUNTIME_BUSY` while mutations/work are pending. Prepared services reject subsequent mutations with 503 `RUNTIME_RESTARTING`; POST `/internal/runtime/release` returns `{prepared:false}`. These internal endpoints require the project Bearer token even for same-origin callers. Health remains available. This changes process lifecycle only, not OS-user Full Access.

## Folder scope and every-turn receipt (TASK-20261011-026)

Shared Codex/OpenCode instructions and per-turn context recommend customer edits in the active folder by default, permitting explicit external-code requests with unchanged Full Access. Saplingagent maintainer development/delivery is confined to its own complete project folder. Every final conversational reply, including read-only chat, is instructed to include the eight-field completion-review receipt in the user's language. Read-only work does not register a modification; unavailable fields/checks are reported honestly. See rules/README.md version2026-10-11.1 and rule18 for the authoritative policy.

These are model instructions, not tool permissions or output rewriting. No changes to native/MCP path access, sandbox/approval policy, OpenCode external_directory permission, public API/SSE schemas or stop/error behavior. Initial/resumed Codex threads and OpenCode system prompts receive the shared policy; each turn receives it again with its active folder. Protocol tests verify delivery and unchanged Full Access. Actual model format compliance remains real-conversation validation; a stopped/failed turn before a final response does not gain a fabricated receipt. Restart is required to load this source; no automatic production restart is performed.

## Windows x64 candidate (TASK-20261011-029)

Native Windows10/11 x64 uses the shared kernel/contracts/local-process.mjs OS contract. Project Node and native executable dependencies remain local. App Server uses codex.exe with file credential storage; OpenCode uses its selected opencode.exe, local XDG data/config/cache/state. The manager and command cancellation stop only their owned live PID trees with taskkill /PID /T /F; POSIX detached process-group behavior is retained. Saplingagent MCP shell commands use ComSpec cmd.exe /d /s /c, regardless of an inherited Git Bash SHELL. HTTP/SSE/permissions remain unchanged, including Full Access. Windows forced termination is abrupt; finish active operations before restart, and externally detached programs or forced parent death cannot guarantee cleanup. Native Windows10 auth/model/restart acceptance is pending; current host checks are macOS/synthetic. Start with bash Saplingagent.sh in Windows Git Bash; platform guide ../../docs/windows-install.html. No actual credentials, global environment or running production processes are changed by this candidate.

## Saved AI schemes and independent readiness (TASK-20261012-003)

Shared kernel/contracts/ai-configuration.mjs reads private local-secrets/ai-config/connections.json and key references. No value is returned publicly. Active Codex API scheme selects its exact model, private API-key environment and custom Responses provider; requiresOpenaiAuth=false permits a configured custom/anonymous endpoint without a ChatGPT account. This is configuration/MCP readiness, not a remote key/quota/model compatibility check. Existing manual Codex settings remain when no scheme is selected; an explicit ChatGPT scheme chooses the built-in OpenAI provider.

An active OpenCode scheme starts OpenCode independently; Codex login is not a launch prerequisite. GET /api/status describes the selected default's readiness/authentication/MCP and additionally {defaultEngine,codexReady}; existing Codex defaults keep prior meanings. OpenCode public status has actual MCP connection readiness but tools/skills inventories are omitted as empty lists rather than invented. GET /health.agentReady matches selected default. GET /api/engines adds defaultSelection:{engine,providerId,modelId}; clients use it only for a new conversation, preserving restored/manual selections. Connected optional Codex can initialize independently; its failures do not fail OpenCode turns. Active OpenCode default must actually exist in the native provider/model catalog and have connected seedagent MCP.

No new tool permissions. Custom OpenCode configs are merged through native provider settings with previous manual XDG config/auth and current all-allow MCP policy. Context/output limits come from user scheme values. No automatic prompt/failover/retry/production restart. Reopen setup, save/select, restart and create a new conversation after changing provider/model; do not silently reinterpret an existing Codex thread with different provider credentials. SSE/session engine binding and explicit model tests remain unchanged. Codex stdio transport now shared in kernel/contracts/codex-rpc.mjs; legacy rpc.mjs re-exports it unchanged.

## Claude Agent engine (TASK-20261012-005–009)

Engine ID `claude` uses the project-local official Claude Agent SDK, with API-only Anthropic Messages profiles. Each conversation binds `engine`, `providerId` (`sapling-<profile-id>`) and `modelId`; existing bindings are immutable. Configuration accepts custom HTTP(S) API base URLs ending in `/v1`; SDK transport removes this trailing API version before its own `/v1/messages` route. Keys remain in local-secrets, never public responses. The default takes effect after restart. Local initialization checks MCP and Skills without a model prompt; authentication means a saved key, not proven quota. Streaming, completion, interruption and failure use existing chat events. Missing native sessions are reported, never silently replaced. Full Access and the completion-review receipt remain unchanged. No claude.ai subscription login is offered.


## Application Git root (TASK-20261012-011)

Git version operations require rev-parse --show-toplevel to resolve to this application's own root (including its legitimate linked worktree). An uninitialized child application returns GIT_NOT_REPOSITORY /404 instead of reading/staging/checking out its parent repository. Git routing environment variables cannot redirect these application-version operations. Choose Git / storage setup in the launcher to initialize a ZIP's own repository (local choice starts empty main; own/follow use the selected initial branch). All success fields and methods remain unchanged. This is version-context correctness, not a filesystem/MCP permission boundary; current-user Full Access and explicit external-code work remain available.


## Empty local main repository (TASK-20261012-015)

GET /api/git supports a repository initialized with no commits: unborn:true, head:null, branch:"main", detached:false, recentCommits:[], historyTruncated:false. branches contains the current unborn main entry with empty SHA/date/subject, current:true and occupied:false; this represents symbolic HEAD, not an existing commit ref. version is "uncommitted" with the existing dirty fingerprint suffix when files are pending. Existing repositories return unborn:false and the unchanged committed head shape. Fingerprint and change tracking work before the first commit. GET is read-only and never creates a baseline commit.

POST /api/git/switch to the current unborn main is a no-op. POST /api/git/commit explicitly saves eligible source as the first local commit on main; known private/runtime files stay excluded. Naming or loading a nonexistent old SHA returns the existing GIT_VERSION_NOT_FOUND. Local reset is a launcher action, not a new HTTP destructive endpoint; there is no automatic reset, remote or initial commit in the version API.


## OpenCode message ownership (TASK-20261012-017)

The existing public SSE schema is unchanged. Internal OpenCode prompt submission uses an explicit native messageID; parts contains user text plus optional native image file parts and system receives static instructions plus current runtime context. Only non-summary assistant messages whose parentID equals that submitted user message may produce text, tool or reasoning progress. User/synthetic/ignored parts and other turns/sessions are not assistant output. Parts received before their message metadata are retained until role/parent attribution is available. Text snapshots are deduplicated per part. Prompt rejection, message/session errors and cancellation remain truthful terminal states; an idle run with no attributed assistant response fails explicitly instead of inventing success. Per-run caches are released on terminal/close paths. Stored conversations are preserved; previous incorrectly recorded replies are not silently deleted.


## Managed ascending ports (TASK-20261014-003)

Unified runtime passes SEED_FRONT_PORT and SEED_AGENT_PORT as integer loopback ports. Agent uses these effective ports for same-origin browser mutation checks; configured defaults remain for standalone callers. Existing workspace/builder/OpenCode/MCP environment routing uses the selected internal ports. No browser token exposure, CORS expansion, endpoint change or Full Access restriction. config/runtime.json remains unchanged by managed startup.

Standalone SEED_AGENT_PORT=0 still asks Node for an ephemeral listener (existing test/development behavior); managed allocation always supplies a positive selected port.

## Attachments and current page (2026-10-15, TASK-20261015-012)

POST /api/attachments accepts local file {id?:UUID,name,contentType?,data:base64},32MiB JSON/20MiB file budget, forwards to workspace and returns public {attachment:{id,name,contentType,size,kind,sha256?,url}} without filesystem paths. GET /api/attachments/:id/content returns safe original content/download; public calls retain existing loopback/same-origin and internal-script Bearer rules.

POST /api/chat adds attachmentIds?:UUID[] (unique,max10). Text may be empty only with attachments. Resolve IDs through workspace before creating/saving a turn; never accept client paths/base64 in chat. Save attachment metadata on the user message; retry identity includes both exact text and ordered IDs. Reusing requestId with different attachments409 IDEMPOTENCY_CONFLICT. No resend on page refresh. Model context receives canonical local file references as untrusted user-supplied data; validated images use native Codex localImage, OpenCode file parts or Claude structured image blocks. Persisted original bytes support file tools and model limitations/errors remain visible, not fabricated conversions.

POST /api/page/heartbeat, GET /api/page/requests?pageId=..., POST /api/page/results proxy same-origin current-page bridge traffic to app-builder. They do not initiate inference or change file permissions. Existing drain/busy protection applies. API body limits for ordinary chat remain unchanged; upload/page snapshot budgets are per-route. No credential/attachment/page bodies in ordinary logs.

## Independent kernel metadata (TASK-20261016-003)

GET /api/kernel ->200 {kernel:{baselineVersion:'0.90',version,appApi,sourceCommit?,installedAt?,state:'managed'|'legacy'|'invalid',lastBackupId?,warning?}}. Read local public manifest and installed receipt through shared contracts/kernel.mjs. Read-only, no network/model/Git mutation or sensitive paths/credentials. Older folders without a manifest return legacy0.90; malformed metadata is invalid with a warning, never a claimed successful update. Kernel updates/restore are offline launcher operations, not arbitrary HTTP file writes.


## Distribution release identity (TASK-20261017-003)

GET /api/release ->200 {release:{schemaVersion:1,version:"0.9.1"}}. No input/body/token required; same loopback/same-origin read policy as GET /api/kernel. Reads the complete folder's public config/release.json through kernel/contracts/release.mjs, independently of Git, kernel and authentication. Returns503 {error:{code:"RELEASE_UNAVAILABLE",message}} for missing/invalid/oversized/symlink metadata; no fallback product version, raw source/paths or extra JSON fields exposed. No model, network, task registration or write. Older backends may return404; frontend retains chat and labels release unavailable. No change to kernel or Git API shape.

## Product0.9.2 engine dependency ownership

Engine adapters resolve their ESM SDKs and native executables through kernel/contracts/engine-dependencies.mjs and kernel/contracts/local-process.mjs from kernel/node_modules. The default application Agent package has no duplicate engine dependencies; its own package/lock remain application-owned for future customer additions. Legacy source fixtures without a kernel package retain explicit backend dependency resolution. Codex stdio/provider/session/streaming and Full Access behavior are unchanged. Default Git UI is removed; existing Agent Git API remains optional application compatibility code, never invoked by installer.

## Unified kernel metadata (2026-10-19)

GET /api/kernel remains the installed kernel contract. The legacy GET /api/release shape is kept for existing clients, but its version now follows the valid installed kernel manifest first; no separate product version exists. Only pre-kernel apps with a missing manifest use the old file fallback. A malformed installed manifest is an error, never a stale-file fallback. Responses remain read-only and contain no receipt secrets or conversation content. Current UI renders only kernel metadata or unavailable.

## Stop during native session relocation

Stop cancels the same thread's pending native resume even before a turnId exists. A cancelled setup finishes as interrupted, or preserves a pre-existing abort cause as failed, without starting/resending a model turn or replacing the saved thread. The new optional transport cancelResume hook complements normal turn/interrupt; older injected transports remain compatible. Native missing-rollout recovery itself belongs to kernel/engines and verifies local history identity. It does not rewrite customer history or reduce Full Access.


## Conversation controls and context usage (TASK-20261019-056)

`PATCH /api/sessions/:id` accepts `{title:string}` and returns200 `{session}`.
Trim the title; require1–200characters, otherwise400 `INVALID_TITLE`.
Only the title is forwarded to workspace; client-supplied message, engine, thread
or usage fields do not mutate a session. Missing sessions return404 `NOT_FOUND`.
Existing same-origin/Bearer and runtime-drain checks also cover this mutation.
Renaming an active conversation updates its in-memory title and broadcasts the
existing `snapshot` event without canceling or issuing a model turn. Concurrent
renames serialize per session, including the workspace write and cache update.

Public session/snapshot adds optional `contextUsage:{usedTokens,contextWindow,
updatedAt}|null`. Counts are safe integers, usedTokens>=0 and contextWindow>=1;
updatedAt is an ISO timestamp recording receipt. Codex's current matching
`thread/tokenUsage/updated` notification supplies `last.totalTokens` and
`modelContextWindow`, never cumulative `total.totalTokens`. Wrong-thread,
wrong-turn, pre-confirmation and finished-run events cannot update another turn.
Unavailable native usage/window clears a previous value to null; malformed counts
are ignored. The latest valid count can decrease. This is provider-reported
context occupancy, not billing totals or proof of a compaction threshold/event.
Other engines currently provide no usage value; absence/null means unknown.

Usage persists with message snapshots, including dirty-session retries and explicit
null clearing. Old sessions remain compatible without migrations. Token events do
not extend the effective-progress timer. Session listing/switching remains read-only;
closing a browser subscription does not interrupt its backend turn or send a prompt.
