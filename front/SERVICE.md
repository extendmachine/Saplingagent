# Frontend service

React single-page chat and requested application components. `main.tsx` mounts `ChatPanel` independently from lazy `App`, wrapped in `ApplicationBoundary`; `App` currently mounts `GitVersionPanel` and `VersionFooter`. Previous empty-App descriptions in task records are historical.

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
