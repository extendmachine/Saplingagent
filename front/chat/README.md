# Basic chat module

TASK-20261009-009: assistant-ui 0.15.26 Thread/Message/Composer primitives and external-store, @assistant-ui/react-markdown 0.14.20 rendering assistant Markdown; TASK019 adds remark-gfm 4.0.1, supports GFM tables, strikethroughs and task lists through MarkdownTextPrimitive's remarkPlugins. An initial input box, no sample messages and business components. Enter send, Shift+Enter to change the line; stop sending instead at runtime, and the input can still be edited.

ChatPanel.tsx is only responsible for the view. useSeedRuntime.ts manages flow and status; runtime-api.ts opens the back-end contract through /api call; sse.ts parses according to the UTF-8/SSE line boundary and merges the text in 50ms. Snapshot avoids reconnection and repeated increments. Stop calling the back-end cancel and do not interrupt the saving first; failure shows an error and reuses requestId to try again. TASK013 adapts to the current full permission mode: the tool is executed with the actual OS user permissions, and there is no one-by-scee approval or compulsory verification requirements. The front-end retains the compatibility of existing approval events, only displays the interaction actually sent by the service, and does not add approval steps by itself.

The browser only saves sessionId; refreshes and restores workspace messages, actively runs subscription /api/events, and can read and save snapshots when the subscription fails. The new conversation retains the old back-end session. The status regularly checks the real model/ready, and does not simulate AI reply; the network header waits for a 10s timeout, and SSE has been established without an overall reply timeout.

TASK-20261010-003 Repair failure pointer: runtime-api retains HTTP status/error code to distinguish between missing session and routing/agent 404. Only when the session request that matches the epoch and the target ID clearly returns 404 NOT_FOUND/`Session does not exist` (or SESSION_NOT_FOUND), unbind the ref and the retry sessionId; localStorage is still deleted for this ID. The message has been displayed, the original text/requestId is retained, and a new session is created by clicking to try again; there is no silent POST. Network, timeout, 401, 500/503, list or routing error retention ID. HTTP header, startup/recovery and the last snapshot check the epoch/target ID again after await, and the old results do not overwrite the subsequent session.

chat.css and main.tsx currently provide independent chat entrances, and the App is mounted in ApplicationBoundary. The full permission mode allows you to modify the chat entrance and other source code, and there is no ordinary write to the white list; the user-generated CurrentTime and existing layout are retained in this copywriting task. Candidate preparation and manual recovery are optional capabilities. The tool event is processed according to the string id/name/status, and the new write/delete/execution command and the native fileChange are not blocked by the front end; commandExecution shows "execute command", and page_propose shows "prepare page change". There is no original canvas keyword operation, and no content is added automatically.

SSE boundary test `npm test`: cross-byte Chinese and emoji, CRLF/multi-line, last EOF, abnormal format and heartbeat, passed. Real integration and manual experience are summarized by root TASK-005.
Add 16 groups of session state/transmission regression in the same command, actually load the useSeedRuntime/runtime-api/sse source code, and check the start, send, explicit retry, active recovery, timeout, different error sources, other label pointers, late response and cleanup with Node VM, synthetic fetch/localStorage and the minimum hook scheduling alia; not DOM verification, do not read real messages, credentials or call models. There is no new dependency, Node24.21 built-in VM experiment prompt to keep; see TASK003 for the handover of results and pending state.
Official information: https://www.assistant-ui.com/docs/runtimes/custom/external-store, https://www.assistant-ui.com/docs/api-reference/primitives/composer, https://www.assistant-ui.com/elements/markdown-text, 2026-10-09 checked; the actual API read the installed version type separately.

TASK019: The table must have a header separation line (such as `| --- | --- |`), and the `.markdown-text table/th/td` style already takes effect directly. Keep the streaming defer, the existing link target/rel and picture description; the vertical lines in the code block and the in-line code are still displayed by code and are not parsed as tables. The repair only works on the body of the assistant Markdown, and does not modify the user message or chat runtime.

## Version switch and restart
After choosing a branch or historical version in Versions, click **Restart app** to reload frontend, backend, Codex App Server and MCP. The adjacent options provide **Restart backend only** and **Runtime recovery**. Busy AI/file work refuses restart. The current frontend stores only a temporary unsent composer draft in sessionStorage for reload, restores the same session and removes that recovery copy; persisted messages stay in workspace. Older versions may not implement this draft support. The fixed recovery page `/__saplingagent/runtime` remains available through the gateway. The current controller must be installed/launched once; subsequent project service changes and internal port edits use Restart app in-page.

Full restart includes auto-discovered/registered project services; see ../../docs/project-services.html. Browser storage/draft recovery is optional: denied storage does not crash the chat or prevent the active page from refreshing after successful restart.

## Right-side collapsible AI chat (2026-10-15)

The central conversation is now a right-edge AI chat panel, initially expanded. Collapse chat hides the panel and leaves an Open AI chat edge tab; reopening restores focus to the composer. The ChatPanel remains mounted while hidden, preserving draft text, messages, running response transport and session state. Desktop application content uses the remaining width; small screens use the available width. Existing App error isolation, Git/restart controls, Stop/Retry/New conversation and API semantics remain unchanged. The version footer is restored to its centered layout with kernel0.90, correcting the earlier footer-target assumption.


## Saved conversations and measurements (TASK-20261019-055)

The panel now exposes saved conversation selection/refresh/rename and a measured-context meter. ConversationControls preserves text/attachment drafts per session in memory; switchSession replaces only the displayed transport and allows switching away while a backend turn continues. Request epochs isolate old streams, cancellations, approvals and list/title reads. History endpoint failure no longer blocks restoring a known session. New session options appear immediately. RestartDraft receives the actual displayed session ID rather than another browser tab's storage pointer.

ChatLauncher implements only the chat edge-tab preference; no shared business panel system is imported. Markdown adds local KaTeX mathematics while preserving GFM and currency. Context usage is unavailable until the provider reports both measured usage and capacity; warning colors do not claim a provider compaction threshold or cost. Main attachment/page inspection/kernel hosts are retained.

## Keep a conversation when changing AI (TASK-20261023-006)

New conversations select an engine/provider/model immediately. Existing conversations stage that choice and use **Apply** to request `POST /api/sessions/:id/engine` with the complete selection and `expectedEngineRevision` (legacy sessions default to0). The response supplies the same logical session with authoritative selection/revision, original messages/title, and optional handoff metadata. Codex account choices now use the catalog described in TASK-20261029-006 below; Codex API profiles retain their configured model. Claude/OpenCode use the actual configured provider/model catalog.

The switch changes no composer state: text, completed or uploading attachments and message IDs remain in place. A pending attachment submission must finish first. Running/loading/restarting/changing states block the operation; the backend also enforces idle/reservation/revision checks. A rejected or malformed response preserves the old visible binding and content, and reports an error. If the connection result is uncertain, reload the conversation before retrying. Switching never sends a model prompt, creates a second logical conversation, or inserts the internal history handoff as a visible user message.

The next explicit send carries the current `engineRevision`. A pending handoff note explains that the backend will pass history on that send; it does not claim that a model already read it. Successful switching clears old tools/approvals/context usage and the old Retry target. Snapshots update the navigation summary's engine/provider/model. Epochs and list generations prevent pre-switch responses from restoring an old binding. On refresh, only user requests after `handoff.throughMessageId` can become retry targets for the current binding; old failures remain visible as historical messages without being resent to another AI.

Tests load the actual hook/API/SSE and EngineControls modules with synthetic fetch and React scheduling, covering preserved history, revisions, engine/model roundtrips, composer attachments, pending submissions, conflicts/malformed responses, late snapshots/lists, old retry boundaries and runtime/busy guards. These checks do not call models or read customer conversations. Build the existing frontend with its locked dependencies; no new dependency, service or port is introduced. Deploy with the matching Agent/workspace endpoint support, then restart the app. Older backends report an explicit endpoint error and retain the current conversation.

## Interface language

The page header switches English/中文 without replacing the mounted chat runtime. The preference is project-wide through /api/runtime/language; guarded browser storage is only a fallback. Drafts, uploaded/pending attachments, title edits, current conversation, active streams and engine handoff metadata remain in place. No chat is automatically resent. Known UI/status/error phrases are localized; conversation/model text, titles, providers, file names and protocol IDs remain original. Context numbers/dates and accessibility labels follow the selected locale. Technical errors expose localized guidance and expandable sanitized original details. See ../localization/ and TASK-20261023-007.

## Codex account model catalog (TASK-20261029-006)

This supersedes the earlier configured-model-only Codex description. Account
model choices use GET /api/engines.models and explicit ?refresh=codex; each complete
server response is isolated by a local request generation. Failed reads preserve
cached choices with an error; no late response resets an explicit selection. An
absent/stale account choice cannot be applied/sent until verified or explicitly
changed, including automatic mode without a valid catalog/default. null remains
automatic; API mode remains fixed. Restart refreshes the
catalog so configuration-mode changes are visible.

modelUsage is restored from session snapshots and cleared when moving to another
session or selecting a new binding. Last confirmed usage is not renamed as the
current request: its original requestId/time/source may precede the current turn.
No report means unavailable. ChatPanel no longer displays global status.model as
a conversation's actual model. EngineControls uses keyed English/Chinese labels,
including missing startup preference/default notices. Full Access, native-thread
handling, drafts, attachments and session revision protection remain unchanged.
On reload, the request ledger's engineRevision prevents an old failed request from
becoming retryable after a model-only binding change with no handoff boundary.
