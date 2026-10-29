# Front single-page chat contract

## Codex account model choice (TASK-20261029-006)

GET /api/engines adds Codex models [{id,label}], defaultModelId,
requestedModel, model (runtime default), modelSelection account/api, optional
modelWarning and modelCatalogError. GET /api/engines?refresh=codex explicitly
refreshes that server catalog. Loading/error state is separate from chat state;
older responses cannot replace newer reads. Cached models remain visibly stale
after errors. A missing explicit choice remains visible, never silently replaced.
An absent model cannot be newly applied or sent. Account automatic selections
also require a successful nonempty catalog and a listed resolved default; failed
refreshes block account requests until retry succeeds. API/legacy defaults remain
compatible. Model selection is not silently rewritten by catalog refreshes.
Startup-preference fallback warnings appear only for automatic selection; explicit
models bypass that default and do not inherit its warning.

Account conversations use {engine:'codex',providerId:null,modelId:string|null};
null means the configured automatic default. Existing conversations use Apply
and the existing revision-checked session endpoint without changing composer,
messages or session ID. API profiles retain their configured model and do not
offer the unrelated account catalog. Listing a model does not prove entitlement.

Session.modelUsage optionally records requestedModel, actualModel, requestId,
updatedAt and source (thread/start, thread/resume, model/rerouted or unreported).
Only a reported actualModel is displayed as the last server-confirmed model;
configuration preferences/runtime defaults are labelled as choices, never actual
execution. The latest confirmed observation may belong to a prior turn and keeps
its request ID/time; missing evidence must not be labelled as a current report.
Snapshots restore usage, and selection/session changes clear it. Old
backends without these additive fields retain legacy Codex default behavior.

Request retry reconstruction checks requests[].engineRevision against the current
session binding. A model-only Codex change can retain the native thread without
handoff metadata; old failed requests must not reappear as retryable after reload.

## Conversation-only default (TASK-20261028-006)

The default `App.tsx` returns null. The independently mounted ChatDock,
PageContextBridge, language controls and Settings entry remain available.
The optional GitHub workflow source is not imported or rendered by this page.
Restoring the entry does not delete sessions, reset conversation state, change
engine selection or add/remove any HTTP/SSE interface.

Version 4; 2026-10-09; TASK-20261009-013. SSE fields continue to be compatible with TASK009; public fields are subject to ../contracts/runtime-api.md, and the front-end calls agent-runtime through HTTP.

|Interface|Input|Output and behavior|
| --- | --- | --- |
| GET /api/status |Nothing|ready/authenticated/model/skills/mcp; clearly shows that the service is unavailable or there is a login problem|
| GET /api/engines |Nothing|Codex readiness plus connected OpenCode and configured Claude Agent providers/models; no credentials|
| GET /api/git |Nothing|Current repository, branch/HEAD, short version number and status fingerprint, work area change, local branch/Worktree occupation and recent submission; panel and bottom version bar regular refresh|
| POST /api/git/commit |Nothing|The upper right panel saves the current non-neglected changes as local submission; does not push remote, running conversation returns 409|
| POST /api/git/switch | branch |Only switch existing local branches safely; successfully return to the latest Git status and reload the page. 409 keeps the current version and displays the reason.|
| GET /api/sessions |Nothing|The id/title/updatedAt of sessions; used by the conversation selector and refresh action.|
| GET /api/sessions/:id |sessionId saved by the browser|session.messages, running, activeRequestId; refresh and restore the same session|
| POST /api/chat |Text, requestId, optional sessionId and new-session engine/provider/model|SSE session/text_delta/status/tool/approval/snapshot/done/error; real streaming display|
| GET /api/events?sessionId=... |Current sessionId|Active session reconnect subscription, snapshot overwrites the next increment; read and save snapshots when the subscription is not possible|
| POST /api/sessions/:id/cancel |Current sessionId|Ok; stop and wait for the final state of the service, do not abandon the output first.|
| POST /api/approvals/:id | decision |Keep the existing front-end interaction event compatibility; the current full-authority tool operation does not need to be approved one by one.|

Each data of SSE is JSON; text_delta contains itemId/delta. Snapshot contains a complete session, which can be used for power-like retry/disconnection recovery; done.status is completed/interrupted/failed. The client parses according to the UTF-8 and SSE line boundaries, and refreshes 50ms by combining increments; HTTP unsuccessful, error events and unexpected disconnections are clearly handled separately.

The empty/new-conversation composer offers Codex, OpenCode or Claude Agent selection. OpenCode and Claude Agent require an available provider and model. Existing idle conversations also allow an explicit staged AI change. Apply commits the complete selection through the same-session engine endpoint; the returned selection remains authoritative across refresh/restart. Browser storage still contains only the opaque active session ID and temporary unsent draft, never provider credentials.

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
The version control is followed by a single Restart app button (frontend, backends and managed project services). It always posts {scope:"all"} to the runtime-manager same-origin endpoint; polling survives Vite restart through the persistent gateway. Selected persisted conversations are reloaded after backend generation changes without sending model requests. Current frontend temporarily saves an unsent composer draft in sessionStorage before switching/restarting, restores only the same selected session, then removes the recovery copy. Legacy UIs may lack this support. Switching and restarting are two explicit steps.

## Standalone AI setup and saved default (TASK-20261012-002)

front/ai-config is an independent React/Vite entry served by backend/ai-config after installer choice Configure AI. Its protected local JSON interfaces, profile fields, login/model/close behavior are defined in kernel/services/ai-config/CONTRACT.md. The standalone page follows launcher language or user toggle; no credentials in browser storage or response, no default chat controls added.

Chat uses GET /api/engines.defaultSelection for a fresh/new conversation only. An explicitly chosen engine and restored session are preserved during polling; new conversation reloads the configured default. GET /api/status.codexReady, when present, gates Codex selection independently from aggregate OpenCode default readiness. Older servers without these optional fields keep prior behavior. No automatic prompt/session conversion. Reconfiguration requires a runtime restart to load provider changes.

## Claude Agent engine (TASK-20261012-005–009)

Engine ID `claude` uses the project-local official Claude Agent SDK, with API-only Anthropic Messages profiles. Each conversation binds `engine`, `providerId` (`sapling-<profile-id>`) and `modelId`; ordinary chat preserves the binding; the explicit AI switch can change it while retaining the conversation. Configuration accepts custom HTTP(S) API base URLs ending in `/v1`; SDK transport removes this trailing API version before its own `/v1/messages` route. Keys remain in local-secrets, never public responses. The default takes effect after restart. Local initialization checks MCP and Skills without a model prompt; authentication means a saved key, not proven quota. Streaming, completion, interruption and failure use existing chat events. Missing native sessions are reported, never silently replaced. Full Access and the completion-review receipt remain unchanged. No claude.ai subscription login is offered.


## Empty local repository (TASK-20261012-016)

GET /api/git may return unborn:true and head:null before the first commit, with a single current symbolic main branch and empty recentCommits. Display main and No commits yet without an error; disable naming the current version until head exists. Save version remains an explicit user action for pending eligible source. Reading/refreshing the panel creates no history and contacts no remote. Existing committed-head responses remain compatible. Reset warnings and metadata deletion belong to the launcher; no reset button or destructive HTTP endpoint is added.

## Explicit setup credential import (TASK-20261013-003)

Configuration page uses protected POST /api/config/credentials/import from backend/ai-config contractv1.1: engine/source/revision/replace, upload JSON string (32KiB document), optional Claude profile draft. State response contains metadata only. Codex account supports local auth.json or upload; Claude API supports inherited/local settings API key or API JSON, with URL/model fields and explicit replacement. No credential persistence in browser storage, no automatic source detection, global write or inference. Errors leave the form available and never display uploaded JSON. Finish setup/restart/new conversation follows existing controls.


## Complete project restart (2026-10-15)

The primary Restart app action always requests scope all, including the frontend, backends and project service plan. The main UI has no restart dropdown, backend-only action or recovery link. A successful new runtime generation refreshes the selected frontend; an in-memory marker works even when sessionStorage is denied. An old ready poll does not consume the marker, and failed/unfinished restarts do not trigger a reload. Conversation/draft recovery and no automatic message resend remain unchanged. New project process registration is handled by the runtime manager, not arbitrary browser commands.

Accessing the sessionStorage property can itself be denied. RestartDraft catches that case before invoking its storage helpers, keeping the chat usable; draft recovery then remains unavailable, while full-restart reload uses its in-memory marker.

## Historical kernel baseline display (superseded below)

The page footer always displays Kernel version 0.90, a source-owned string in front/features/version/VersionFooter.tsx. It records the original kernel baseline independently of Git branches, commits and custom version names, including when Git is unavailable. Keep the trailing zero; update this value only for an explicit kernel release. Existing Git version polling/refresh behavior is unchanged.

## Right-side collapsible AI chat (2026-10-15)

The central conversation is now a right-edge AI chat panel, initially expanded. Collapse chat hides the panel and leaves an Open AI chat edge tab; reopening restores focus to the composer. The ChatPanel remains mounted while hidden, preserving draft text, messages, running response transport and session state. Desktop application content uses the remaining width; small screens use the available width. Existing App error isolation, Git/restart controls, Stop/Retry/New conversation and API semantics remain unchanged. The version footer is restored to its centered layout with kernel0.90, correcting the earlier footer-target assumption.

## Composer attachments and page inspection (2026-10-15, TASK-20261015-014)

Existing assistant-ui AttachmentAdapter integrates a multiple-file picker, file/image drag-drop on the chat, and paste events exposing clipboard files/images; ordinary text paste remains normal. Uploads go to POST /api/attachments, persist locally and show pending/progress/error/removal/preview states. Sending accepts text or completed attachments and forwards opaque IDs; messages restore previews/downloads from persisted metadata. Existing same requestId and attachment IDs are retained for retry. Collapsing the chat keeps uploads/drafts/runtime mounted. Browser clipboard formats that expose only text are treated as text; no clipboard-read permission is requested.

An independent PageContextBridge stays mounted for the open project page, registers with /api/page/heartbeat and long-polls capture requests, then posts fresh DOM/layout and optional PNG from the rendered document. DOM-to-image uses one locked frontend-only dependency; no browser executable/OS screen capture. Password inputs, unsent drafts and private capture-excluded nodes are omitted. Screenshot failures produce warnings with real DOM; closed-page capture reports unavailable. Captures do not execute AI-supplied scripts or interact with controls.

## Independent kernel version (TASK-20261016-004)

Footer keeps the original0.90 baseline fallback while displaying installed version from read-only GET /api/kernel separately from Git/application version. Network/legacy metadata does not hide the baseline. Kernel source update/check/restore belongs to the launcher; interface changes do not add an HTTP overwrite or permission gate.


## Historical product release versus kernel and workspace (superseded below) (TASK-20261017-002)

Footer reads additive GET /api/release (Agent contract) and shows Saplingagent product release independently from GET /api/kernel and GET /api/git. It validates schema1 and a three-part version; loading/404/503/malformed metadata stays explicitly unavailable without an old-version fallback. Chat and other version controls remain usable if an older backend lacks this route. Product version is not read from Git tags and survives local-only Git initialization. No new HTTP write or permission policy.

## Default application and kernel navigation (updated 2026-10-23)

Default App is an empty application-owned extension point; optional legacy GitVersionPanel, Save version and workspace Git footer remain unmounted. PageHeader provides a compact localized Settings link opening the current origin's /__saplingagent/runtime in a new tab, preserving the original chat page. The previous embedded kernel control/footer frames and host postMessage bridge are removed. Standalone core UI/dependencies remain independent of front's React/Vite/package manifests, and direct /__saplingagent/kernel remains available. Legacy components are optional application source, not kernel ownership.

## Unified kernel version (2026-10-19)

There is one current Saplingagent version: kernel0.9.6. kernel/manifest.json is authoritative. UI, setup, Bash, packages and upgrade targets use that installed value, never a separate product number. config/release.json and JSON releaseVersion/productVersion fields are deprecated compatibility mirrors/aliases, not independent identities; source packaging verifies agreement. Kernel-only maintenance changes the displayed kernel version without touching business configuration. Missing/invalid installed metadata is unavailable in UI, not a claimed baseline. Git revisions remain source identifiers.

New comparison normalizes only historical labels0.90→0.9.0,0.91→0.9.2,0.92→0.9.3; original manifests/backups stay byte-exact. Shipped old comparators cannot understand0.9.4. Stop the app, download new tooling into an isolated .cache subfolder, then run that tooling's kernel/cli.mjs --root ORIGINAL_APP check/update with the project-local Node. Default is preview; update requires existing explicit risk acknowledgement and refuses conflicts/live targets. Never overwrite/rebaseline local core edits or regenerate a customer manifest to hide them. Source recovery remains explicit.


## Conversation history and context (TASK-20261019-055)

GET /api/sessions supplies id/title/updatedAt/engine/providerId/modelId summaries. The chat lists them in title order (Chinese pinyin/English, numeric comparison), with date and id tie breakers. Selecting a conversation reads its snapshot, then subscribes if running, without cancelling its backend run or sending a prompt. Loading ends after the snapshot; other conversations remain selectable during streaming. PATCH /api/sessions/:id accepts only {title}, trimmed 1–200 characters; its saved session updates the title without changing bindings/messages. Stale list/title/transport results never overwrite the current selection.

Session snapshots optionally include contextUsage {usedTokens,contextWindow,updatedAt}: nonnegative safe integer tokens, positive safe integer capacity and provider observation timestamp. Show only actual valid measurements, otherwise unavailable. Capacity warnings are display thresholds, not billing totals or a prediction of automatic compaction. Source engines that do not report capacity remain unavailable.

Unsent text and attachments are kept in page memory per selected conversation during explicit switches. Completed uploads reuse their local IDs; unfinished files retry their upload only when restored. No switch sends a model request. Restart/pagehide recovery remains text-only and uses the displayed session identity, independent of another tab's stored selection. Attachments still require reselection after a full page reload.

A refused runtime-busy switch restores the source composer and leaves the target draft untouched. While assistant-ui has a pending attachment submission awaiting upload, switching/new-chat is refused with a message until submission finishes, preserving the submitted content.

## Same-conversation AI selection (TASK-20261023-006)

Existing conversations stage a target engine/provider/model and apply it through POST /api/sessions/:id/engine with expectedEngineRevision (legacy0). The response updates the same logical session, never calls New conversation or resets its composer, and clears only old tool/approval/usage/retry state. ID, title, visible history, draft text and in-memory draft attachments remain. While switching, submitting, loading, restarting or running, conflicting actions are disabled. Request epochs reject stale responses; server revision checks protect other tabs. Errors retain existing content; an unknown response outcome can require reloading the authoritative session. Pending handoff is explained separately from the message transcript.

No model request is sent by changing AI. The next explicit send includes the current engineRevision and triggers Agent history delivery when needed. Snapshot recovery does not recreate a Retry action for requests before the current handoff boundary or from an older binding. Codex account model selection is defined in TASK-20261029-006 above; fixed API profiles retain their configured model. Separate historic conversations remain separate.

## UI language and error contract (2026-10-23)

GET /api/runtime/language and POST /api/runtime/language {language:'en'|'zh'} return {language,supported:['en','zh']}; the runtime owns project-local persistence independent of ports. The browser uses its language and guarded `saplingagent.ui-language.v1` only as an initial/offline fallback. No secret or conversation content enters this preference. A stale initial read cannot override an explicit click; writes are serialized and save failures retain the active UI language with retry. Language changes do not remount chat, clear text/attachments, change sessions/engine bindings, reload the page or send model requests.

The front catalog is keyed English/Chinese, not inline translation pairs. Numbers/dates, document.lang, accessible labels, empty/progress/tool/validation states and optional controls follow the same context. User/model text, titles, file names, provider labels, models, actual paths and protocol values remain unchanged. Only exact known runtime status phrases are localized; unknown provider-generated content remains original.

The default App no longer embeds kernel control/version frames or their message bridge. PageHeader contains the compact brand, language selector and Settings. Help is available in the Settings page, not the chat header. Settings is an ordinary same-origin link to /__saplingagent/runtime, using the current allocated port and a new tab with noopener/noreferrer. The original chat remains mounted with its draft, attachments and stream. Its localized title announces the new tab. Language persists through the existing project preference API; the runtime page reads it on arrival. The Settings Help link remains /__saplingagent/help?lang=en|zh and follows that page's current language. Existing pagehide text-draft recovery remains unchanged. No navigation triggers a model request.

Structured error causes retain code/message. UI displays a localized explanation and actionable next step with expandable original technical details processed by kernel/localization/public.mjs. Credentials are redacted by that shared classifier. Known UI validation phrases use catalog entries; errors never rewrite conversation messages. Full Access and all existing operation guards remain unchanged.


## Project browser tab title (TASK-20261027-002)

The application tab displays the configured project folder name from read-only GET /api/runtime/status.projectFolderName, not the native app display name. An older runtime falls back to the basename of applicationRoot (macOS/Windows paths); unavailable metadata retains the localized Saplingagent title. The name is plain text, remains unchanged when switching English/Chinese and is not stored in browser storage. Read once on mount and refresh on window focus with cancellation and a five-second deadline; temporary failures keep the last known name. No chat remount, model request, configuration write or new dependency/service. Frontend source/build deployment is required; kernel-only upgrades do not replace application UI. A cold controller restart enables the new explicit field.
