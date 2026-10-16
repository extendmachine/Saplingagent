# Front single-page chat contract

Version 4; 2026-10-09; TASK-20261009-013. SSE fields continue to be compatible with TASK009; public fields are subject to ../contracts/runtime-api.md, and the front-end calls agent-runtime through HTTP.

|Interface|Input|Output and behavior|
| --- | --- | --- |
| GET /api/status |Nothing|ready/authenticated/model/skills/mcp; clearly shows that the service is unavailable or there is a login problem|
| GET /api/engines |Nothing|Codex readiness plus connected OpenCode and configured Claude Agent providers/models; no credentials|
| GET /api/git |Nothing|Current repository, branch/HEAD, short version number and status fingerprint, work area change, local branch/Worktree occupation and recent submission; panel and bottom version bar regular refresh|
| POST /api/git/commit |Nothing|The upper right panel saves the current non-neglected changes as local submission; does not push remote, running conversation returns 409|
| POST /api/git/switch | branch |Only switch existing local branches safely; successfully return to the latest Git status and reload the page. 409 keeps the current version and displays the reason.|
| GET /api/sessions |Nothing|The id/title/updatedAt of sessions; used to confirm that the session has been saved, and the session navigation is not preset.|
| GET /api/sessions/:id |sessionId saved by the browser|session.messages, running, activeRequestId; refresh and restore the same session|
| POST /api/chat |Text, requestId, optional sessionId and new-session engine/provider/model|SSE session/text_delta/status/tool/approval/snapshot/done/error; real streaming display|
| GET /api/events?sessionId=... |Current sessionId|Active session reconnect subscription, snapshot overwrites the next increment; read and save snapshots when the subscription is not possible|
| POST /api/sessions/:id/cancel |Current sessionId|Ok; stop and wait for the final state of the service, do not abandon the output first.|
| POST /api/approvals/:id | decision |Keep the existing front-end interaction event compatibility; the current full-authority tool operation does not need to be approved one by one.|

Each data of SSE is JSON; text_delta contains itemId/delta. Snapshot contains a complete session, which can be used for power-like retry/disconnection recovery; done.status is completed/interrupted/failed. The client parses according to the UTF-8 and SSE line boundaries, and refreshes 50ms by combining increments; HTTP unsuccessful, error events and unexpected disconnections are clearly handled separately.

The empty/new-conversation composer offers Codex, OpenCode or Claude Agent selection. OpenCode and Claude Agent require an available provider and model. Once the first message creates the session, the selector is hidden and the saved session selection is authoritative across refresh/restart. Starting a new conversation makes selection available again. Browser storage still contains only the opaque active session ID and temporary unsent draft, never provider credentials.

Send blank will not be executed; repeat sending is disabled at runtime, and stop is still available. Fail to reuse the original requestId and no more user messages will be added; if the service is still running, reconnect the current session. The single input box supports Enter sending, Shift+Enter lineback and Markdown text display.
The browser localStorage only saves the opaque sessionId of seedagent.active-session.v1; messages are persisted locally by workspace. Old seedagent.layout-preview.v1 does not read, does not write, does not clear. The browser does not store credentials.

TASK-20261010-003 Error Recovery: HTTP error keeps status and error.code/message for client judgment, and the external interface field remains unchanged. Only unbind the ID when the selected session request returns 404 and the code is NOT_FOUND and the message is `Session does not exist` (or specify SESSION_NOT_FOUND). List, routing or naked 404 and network/timeout/401/500/503 do not release the pointer. The cleanup must match the current request epoch, target ID and browser cache value; the old response cannot refresh the pointer or overwrite the new snapshot. Send/restore to confirm that after the missing session, keep the displayed message, text/requestId, retry only remove the invalid sessionId, and POST after the user clicks; do not automatically send new model requests, and do not repeat additional user messages.

At present, the main mounts chat and App independently, and the App uses GitVersionPanel; App rendering exceptions have independent boundaries, and panel errors will not replace chats. Git switching only calls the above Agent public interface, does not process credentials or shells, and does not provide stash/force/discard. When selecting an existing branch, the current work area is allowed to be changed. The back-end will automatically submit all the files that have not been ignored before switching; the panel shows the recently submitted page version, but does not create or delete branches and does not operate remotely. The full permission mode allows the modification of main/chat and other front-end and back-end files. The specific general files and command execution are still borne by the back-end, and the scope is the current OS user permissions of the process. There is no front-end tool whitelist or mandatory protection prompt.
"Save Submission" in the upper right panel is only available when there is a change in the workspace. After calling POST /api/git/commit, the saved short SHA is displayed. The button does not push remote, nor does it create, delete or switch branches.
The bottom VersionFooter also calls GET /api/git only, displaying `branch · version number`. It takes the fingerprint when the page is loaded as the baseline, and polls every 5 seconds and when the page is restored to visibility; after the fingerprint changes, it displays "discover new version, refresh update", and the user clicks to perform the browser refresh. After the complete refresh, the baseline is updated, and the chat request will not be automatically reloaded or sent.

Tool events accept id/name/status strings uniformly; workspace_write_file, workspace_delete_file, workspace_run_command and native commandExecution/fileChange can be displayed and continue without relying on page_propose/validated or approve events. There is no need for approval or compulsory verification in the background; candidate and manual page_rollback can be selected, and the actual recovery scope is explained by the app-builder change record. Tool errors are still handled according to the real error/done, and the permission is released without taking failure as a success.

Development and static preview through Vite /api proxy to the default 127.0.0.1:4310; the unified launcher passes SEED_AGENT_PORT according to config/runtime.json, the agent only accepts integer ports and fixes the loop host, and supports custom Agent ports. Production static resource deployment must be configured with the same source reverse proxy, and cannot directly take the dist file pseudo-name back-end access. The browser has no API key, internal service token or Codex login data.

## Historical versions and custom labels (2026-10-11)

GET /api/git?limit=25 returns named branches and recentCommits (25 by default, integer 1..500), historyTruncated, and optional displayName on head/commit entries. Local custom names are keyed by full SHA and stored atomically in the repository common Git directory: saplingagent/version-labels.json. They survive branch changes/restarts and are not commit subjects or remotely published metadata. A malformed store returns GIT_LABELS_INVALID instead of being overwritten.

POST /api/git/label {sha,name}: sha must be an existing full 40/64-character hexadecimal commit ID; name is trimmed, maximum 80 characters, with control characters rejected. Empty name clears the alias. Returns {git}. Writes are serialized and a repository label-file lock rejects concurrent writers (GIT_LABEL_BUSY,409). Names may use the user's language.

POST /api/git/checkout {sha} loads an existing historical commit into detached HEAD, leaving main/testcode/release tips unchanged. Before checkout/switch, pending nonignored work is committed; detached commits are retained under refs/saplingagent/saved/<sha>. Branch switching now also works from detached HEAD, and POST /api/git/commit can save detached work under that recovery ref. All operations remain local, without force/reset/push. Historical code may lack this panel; use git switch main from Terminal to return. Browser reload changes frontend source; backend/dependency changes require a service restart. Ignored credentials and session data remain outside Git checkout.

Agent rejects mutations during active AI (GIT_AGENT_BUSY), concurrent Git mutation (GIT_SWITCH_BUSY), and starting a new chat during a Git mutation. Invalid/missing commit errors use GIT_INVALID_VERSION/GIT_VERSION_NOT_FOUND. Label I/O failure uses GIT_LABELS_INVALID/GIT_LABEL_BUSY or the existing internal error path.

Saving versions excludes known private/runtime artifacts even if historical ignore rules are absent; GIT_PRIVATE_FILES (409) rejects already staged private paths. History is bounded to 500 commits per read; older versions can also be loaded by a full commit ID through the API.

## Restart app
The version control is followed by Restart app (frontend and backends) and Restart backend only. These use the runtime-manager contract and same-origin endpoints; polling survives Vite restart through the persistent gateway. Selected persisted conversations are reloaded after backend generation changes without sending model requests. Current frontend temporarily saves an unsent composer draft in sessionStorage before switching/restarting, restores only the same selected session, then removes the recovery copy. Legacy UIs may lack this support. Switching and restarting are two explicit steps.

## Standalone AI setup and saved default (TASK-20261012-002)

front/ai-config is an independent React/Vite entry served by backend/ai-config after installer choice Configure AI. Its protected local JSON interfaces, profile fields, login/model/close behavior are defined in backend/ai-config/CONTRACT.md. The standalone page follows launcher language or user toggle; no credentials in browser storage or response, no default chat controls added.

Chat uses GET /api/engines.defaultSelection for a fresh/new conversation only. An explicitly chosen engine and restored session are preserved during polling; new conversation reloads the configured default. GET /api/status.codexReady, when present, gates Codex selection independently from aggregate OpenCode default readiness. Older servers without these optional fields keep prior behavior. No automatic prompt/session conversion. Reconfiguration requires a runtime restart to load provider changes.

## Claude Agent engine (TASK-20261012-005–009)

Engine ID `claude` uses the project-local official Claude Agent SDK, with API-only Anthropic Messages profiles. Each conversation binds `engine`, `providerId` (`sapling-<profile-id>`) and `modelId`; existing bindings are immutable. Configuration accepts custom HTTP(S) API base URLs ending in `/v1`; SDK transport removes this trailing API version before its own `/v1/messages` route. Keys remain in local-secrets, never public responses. The default takes effect after restart. Local initialization checks MCP and Skills without a model prompt; authentication means a saved key, not proven quota. Streaming, completion, interruption and failure use existing chat events. Missing native sessions are reported, never silently replaced. Full Access and the completion-review receipt remain unchanged. No claude.ai subscription login is offered.


## Empty local repository (TASK-20261012-016)

GET /api/git may return unborn:true and head:null before the first commit, with a single current symbolic main branch and empty recentCommits. Display main and No commits yet without an error; disable naming the current version until head exists. Save version remains an explicit user action for pending eligible source. Reading/refreshing the panel creates no history and contacts no remote. Existing committed-head responses remain compatible. Reset warnings and metadata deletion belong to the launcher; no reset button or destructive HTTP endpoint is added.

## Explicit setup credential import (TASK-20261013-003)

Configuration page uses protected POST /api/config/credentials/import from backend/ai-config contractv1.1: engine/source/revision/replace, upload JSON string (32KiB document), optional Claude profile draft. State response contains metadata only. Codex account supports local auth.json or upload; Claude API supports inherited/local settings API key or API JSON, with URL/model fields and explicit replacement. No credential persistence in browser storage, no automatic source detection, global write or inference. Errors leave the form available and never display uploaded JSON. Finish setup/restart/new conversation follows existing controls.


## Complete project restart (2026-10-15)

The primary Restart app action always requests scope all, including the frontend, backends and project service plan. The explicit submenu is labeled Restart backend only. A successful new runtime generation refreshes the selected frontend; an in-memory marker works even when sessionStorage is denied. An old ready poll does not consume the marker, and failed/unfinished restarts do not trigger a reload. Conversation/draft recovery and no automatic message resend remain unchanged. New project process registration is handled by the runtime manager, not arbitrary browser commands.

Accessing the sessionStorage property can itself be denied. RestartDraft catches that case before invoking its storage helpers, keeping the chat usable; draft recovery then remains unavailable, while full-restart reload uses its in-memory marker.
