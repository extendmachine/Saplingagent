# Frontend service

React single-page chat and requested application components. `main.tsx` mounts `ChatDock`/`ChatPanel` independently from lazy `App`, wrapped in `ApplicationBoundary`; `App` currently mounts `GitVersionPanel`, `RestartServices` and `VersionFooter`. Previous empty-App descriptions in task records are historical.

## Responsibilities and boundaries

- Render streaming text, GFM Markdown, tool activity, real errors, Stop/Retry/New conversation and session recovery.
- Call the public agent-runtime HTTP/SSE API; never read workspace files, credentials or internal service tokens directly.
- Read local Git versions, request save/switch operations and display source-refresh reminders. Backend Git is authoritative; frontend does not run shell commands or offer force/discard actions.
- Application features normally belong in `front/features/`. This is organization, not a protected-directory policy. Full Access permits chat/backend/MCP/Skills edits within user authorization.

## Dependencies and runtime

React/React DOM 19.3.0; assistant-ui React 0.15.26 and Markdown 0.14.20; remark-gfm 4.0.1; lucide-react 1.54.0; TypeScript 7.0.2; Vite 8.3.4. Exact versions and direct license metadata are locked in this service's package files. Mac delivery installs Node 24.21.0 locally. Dependencies/cache/build artifacts remain local and ignored.

Markdown uses `remarkPlugins={[remarkGfm]}` with deferred rendering, external-link isolation and textual image descriptions. No raw HTML execution is enabled. Table styling in `chat/chat.css` applies to parsed GFM tables.

## Lifecycle

Use the Mac launcher or root `node scripts/dev.mjs`. Standalone: `npm ci`, then `npm run dev -- --port 5173`; run the Agent separately. Vite proxies `/api` to loopback Agent port 4310 (or valid `SEED_AGENT_PORT`). Production static serving requires a same-origin proxy.

The root launcher records daily frontend lifecycle metadata in `logs/front/front-YYYY-MM-DD.log`, retaining ordinary logs for 30 days. Raw Vite/build diagnostics appear in the terminal, without credentials. Frontend code uses English labels; user messages retain their chosen language.

## Persistence and recovery

`seedagent.active-session.v1` stores only an opaque session ID. Messages live in workspace. Confirmed session-not-found errors unbind only the matching stale pointer and retain retry input/requestId. Route/bare 404, list failures, network/timeouts and other errors do not prove the selected session is missing. Request epochs prevent obsolete responses overwriting a newer conversation. Never automatically resend a model request.

Git controls poll every five seconds when visible. Saving commits nonignored changes locally; switching auto-commits pending changes and refuses occupied branches or active turns. The footer compares fingerprints from page load and offers manual refresh. Restart backend/MCP/dependency processes after their code changes.

## Validation

20 existing chat/SSE/session tests and TypeScript/Vite build pass for the English candidate. Browser synthetic preview verifies English chat/table/Git/footer without real model calls or user-data writes. The existing >500 kB bundle warning remains. Human acceptance and branch synchronization are recorded in the authoritative coordination index.

Contracts: `CONTRACT.md`; deployment: `DEPLOY.md`; sources: `REFERENCES.md`; history/handoffs: `ai-tasks/`.

## Version panel update (2026-10-11)

The panel lists historical commits with optional custom names and permits loading a selected commit in detached HEAD. Named branch tips stay unchanged by historical checkout, except an explicit pre-checkout save of pending named-branch work. Saving detached work creates a retained refs/saplingagent/saved/<sha> recovery ref; users can return to an available branch. Save version still excludes known private data, credentials and local runtime/build artifacts even when old source lacks ignore rules; explicitly staged private files return GIT_PRIVATE_FILES (409). No filesystem access restrictions are added.

Select a commit, edit Version name and choose Save name. Empty text clears its alias. Aliases are local repository metadata in the common Git directory (saplingagent/version-labels.json), survive branch changes/restarts and preserve the SHA and original subject. Names are not included in a Git push or source ZIP. A failed writer lock may require removing version-labels.json.lock only after checking that no writer is alive. Malformed labels must be repaired from backup; they are never silently overwritten.

The starting page remains chat with Git controls/footer. The earlier uncommitted clock was explicitly reverted by the user. Checkout reloads frontend source, while changed backend code/dependencies require a service restart; old commits may lack the panel, in which case git switch main from Terminal restores its source. Do not reset sessions/authentication to restore source. No new dependency or login change.

## Version switch and restart
After choosing a branch or historical version in Versions, click **Restart app** to reload frontend, backend, Codex App Server and MCP. The main page provides only **Restart app**, with no options dropdown. It always performs the complete managed-project restart. Busy AI/file work refuses restart. The current frontend stores only a temporary unsent composer draft in sessionStorage for reload, restores the same session and removes that recovery copy; persisted messages stay in workspace. Older versions may not implement this draft support. The fixed recovery page `/__saplingagent/runtime` remains available through the gateway. The current controller must be installed/launched once; subsequent project service changes and internal port edits use Restart app in-page.

TASK-20261012-002 adds the separate front/ai-config React entry and project-local .cache/ai-config-ui build using existing dependencies. It runs through backend/ai-config without the main chat. Frontend default-engine selection accepts the new optional Agent catalog/status fields only for fresh conversations, preserving saved/manual selections and legacy protocol compatibility. See ai-config/README.md and backend setup contract. No credential browser persistence or new main-page component.

Claude Agent engine support: see CONTRACT.md and DEPLOY.md for the shared API profile/session binding and local runtime behavior. No changes to the minimal single-chat product scope.


## Empty local main (TASK-20261012-016)

The version panel accepts nullable head and unborn status, shows only the current main supplied by the Agent, and displays No commits yet with an empty committed list. Current-version naming stays disabled until a commit exists. Save version is explicit; polling does not populate history. The footer still uses a valid version string/fingerprint before the first commit.


## Complete project restart (2026-10-15)

The primary Restart app action always requests scope all, including the frontend, backends and project service plan. The main UI has no restart dropdown, backend-only action or recovery link. A successful new runtime generation refreshes the selected frontend; an in-memory marker works even when sessionStorage is denied. An old ready poll does not consume the marker, and failed/unfinished restarts do not trigger a reload. Conversation/draft recovery and no automatic message resend remain unchanged. New project process registration is handled by the runtime manager, not arbitrary browser commands.

Accessing the sessionStorage property can itself be denied. RestartDraft catches that case before invoking its storage helpers, keeping the chat usable; draft recovery then remains unavailable, while full-restart reload uses its in-memory marker.

## Kernel baseline version (2026-10-15)

The page footer reads the installed package version from GET /api/kernel independently of Git history. The original baseline and fallback remain0.90, including when metadata is unavailable/invalid or the legacy package has no manifest. Managed packages display their own manifest version; do not change the fallback merely for application edits. Kernel metadata loads once per page; restart/reload after maintenance. Existing Git version polling/refresh behavior is unchanged.

## Right-side collapsible AI chat (2026-10-15)

The central conversation is now a right-edge AI chat panel, initially expanded. Collapse chat hides the panel and leaves an Open AI chat edge tab; reopening restores focus to the composer. The ChatPanel remains mounted while hidden, preserving draft text, messages, running response transport and session state. Desktop application content uses the remaining width; small screens use the available width. Existing App error isolation, Git/restart controls, Stop/Retry/New conversation and API semantics remain unchanged. The version footer is restored to its centered layout with kernel0.90, correcting the earlier footer-target assumption.

## Chat files and current rendered page (TASK-20261015-014)

The composer adds a multiple-file picker, file/image drop zone and paste handling when the clipboard exposes files. Ordinary text paste is unchanged; copied filesystem paths are text, not file bytes. The existing assistant-ui AttachmentAdapter uploads locally and shows image/file chips, progress, removal and real errors. Text or completed attachments can be sent; restored messages retain previews/downloads. Each file is at most 20 MiB and each message 10 attachments. PNG/JPEG/GIF/WebP are detected by the storage service. Other formats remain files. No automatic Office/PDF extraction is promised.

The independently mounted PageContextBridge handles fresh page_read requests even with chat collapsed. capture.ts returns rendered DOM/text/layout and optional PNG using lazy html-to-image1.11.13 (MIT), the only new locked dependency. Passwords, input values, unsent drafts and chat messages are excluded; application regions can use data-page-private. No navigator.clipboard.read, OS screen capture or permission prompt. Image rendering failure keeps fresh DOM/layout with explicit warnings. See docs/runtime.html and service contracts for scope and limits.

Product release label reads the additive Agent /api/release route from the same origin; it is independent of kernel/Git labels and never defaults to the kernel baseline. See CONTRACT.md and contracts/release.md.
