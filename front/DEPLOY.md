# Frontend run and recovery

Use the project-local Mac installer and launcher described in root README. Mac runtime is pinned to Node 24.21.0; dependencies belong to front/node_modules with this service's lockfile. No global dependency installation or frontend credential file is required.

For separate frontend development:

```sh
npm ci
npm run dev -- --port 5173
```

Run agent-runtime separately. Vite `/api` proxies to 127.0.0.1:4310 by default. Match a custom Agent port explicitly:

```sh
SEED_AGENT_PORT=4410 npm run dev -- --port 5173
```

The full launcher sets this from config/runtime.json. Never expose secrets through VITE_ variables or browser storage. Stop the startup terminal with Control+C.

Build/check with existing service commands:

```sh
npm run build
npm test
npm run preview -- --port 4173
```

Production dist needs a same-origin reverse proxy; opening file:// is insufficient. Backend errors and unavailable authentication remain explicit. The input stays editable while sending is disabled until the Agent is ready.

The root launcher logs frontend lifecycle metadata under logs/front by day with 30-day retention. Build/Vite diagnostics appear in the terminal. Real logs, dependencies, caches and build output are Git-ignored.

The browser saves only the opaque session ID; actual messages remain in workspace. Refresh/reconnect reads snapshots without resending inference automatically. New conversation changes the display, not stored history. Rendering failures in App leave chat usable so the user can request a fix or recorded-original restoration.

Git save/switch changes the actual local repository. Switching automatically saves nonignored changes and reloads the page; backend processes require restart to load target source. Historical branches may not contain the Git panel. Do not reset real messages/credentials with source recovery. Optional page_rollback restores only recorded originals, on user request.

English candidate: 20 isolated chat/SSE tests, type/build and synthetic browser checks pass. Actual model-account entitlement, Finder/OAuth and Intel hardware are not retested by language-only preview. Existing bundle-size warning remains.

## Version panel update (2026-10-11)

The panel lists historical commits with optional custom names and permits loading a selected commit in detached HEAD. Named branch tips stay unchanged by historical checkout, except an explicit pre-checkout save of pending named-branch work. Saving detached work creates a retained refs/saplingagent/saved/<sha> recovery ref; users can return to an available branch. Save version still excludes known private data, credentials and local runtime/build artifacts even when old source lacks ignore rules; explicitly staged private files return GIT_PRIVATE_FILES (409). No filesystem access restrictions are added.

Select a commit, edit Version name and choose Save name. Empty text clears its alias. Aliases are local repository metadata in the common Git directory (saplingagent/version-labels.json), survive branch changes/restarts and preserve the SHA and original subject. Names are not included in a Git push or source ZIP. A failed writer lock may require removing version-labels.json.lock only after checking that no writer is alive. Malformed labels must be repaired from backup; they are never silently overwritten.

The starting page remains chat with Git controls/footer. The earlier uncommitted clock was explicitly reverted by the user. Checkout reloads frontend source, while changed backend code/dependencies require a service restart; old commits may lack the panel, in which case git switch main from Terminal restores its source. Do not reset sessions/authentication to restore source. No new dependency or login change.

## Version switch and restart
After choosing a branch or historical version in Versions, click **Restart app** to reload frontend, backend, Codex App Server and MCP. The main page provides only **Restart app**, with no options dropdown. It always performs the complete managed-project restart. Busy AI/file work refuses restart. The current frontend stores only a temporary unsent composer draft in sessionStorage for reload, restores the same session and removes that recovery copy; persisted messages stay in workspace. Older versions may not implement this draft support. The fixed recovery page `/__saplingagent/runtime` remains available through the gateway. The current controller must be installed/launched once; subsequent project service changes and internal port edits use Restart app in-page.

## Independent AI configuration entry

After installation run `bash Saplingagent.sh configure` from the root. The launcher builds kernel/ui/setup/vite.config.mjs with existing locked frontend dependencies to kernel/.cache/setup, then the separate configuration service serves it before chat starts. No main Vite proxy or current Agent dependency. English/Chinese controls follow the launcher. Finish setup stops only setup and returns to the launcher; restart an already-running chat and create a new conversation to apply saved engine/provider changes. API keys never enter browser storage or public build variables. Real account sign-in and native Windows browser acceptance remain pending.

## Claude Agent delivery

Install/update using the same project-local Bash launcher. Agent dependencies pin official Claude Agent SDK0.3.296, including optional native macOS/Windows x64/arm64 binaries; do not omit optional packages. The installer verifies the native binary without a model prompt. No separate global Claude Code installation, new public port or global account import is required. Configure AI in the independent page, choose Claude Agent / Anthropic Messages, save an API key/model/custom API base URL, finish, restart and begin a new conversation. Startup control initialization and MCP/Skills checks do not establish provider quota.

Keys use local-secrets/api-keys/ai-<id>.json and the shared credential ledger. SDK settings/transcripts use local-secrets/claude/. CLAUDE.md imports AGENTS.md; existing .agents/skills loads through .agents/.claude-plugin/plugin.json. Full Access remains bypassPermissions with sandbox disabled. Native dialogs are not advertised/rendered; ordinary chat questions are used. Stopping/restarting terminates only owned process trees before releasing a running session. Windows10 actual SDK/model/browser acceptance is pending.

Rollback: preserve local-secrets and data, select the previous reviewed Git version, install its lockfiles and restart. Older versions cannot parse Claude profiles; before switching back, select a compatible default in the current setup page, back up connections.json, then deliberately remove only Claude profiles from that metadata file before starting the older version. Do not overwrite or delete credentials or transcripts automatically. Recheck health and an existing conversation after rollback.

Unified launcher port note (TASK-20261014-004):5173/5174 are starting values. Use the actual printed gateway URL after ascending allocation; existing SEED_AGENT_PORT/SEED_RUNTIME_MANAGER_PORT route Vite to selected backends. Selected ports persist through in-app restart; source config is unchanged. Standalone npm run dev behavior is unchanged.

Full restart includes auto-discovered/registered project services; see ../docs/project-services.html. Browser storage/draft recovery is optional: denied storage does not crash the chat or prevent the active page from refreshing after successful restart.

## Right-side collapsible AI chat (2026-10-15)

The central conversation is now a right-edge AI chat panel, initially expanded. Collapse chat hides the panel and leaves an Open AI chat edge tab; reopening restores focus to the composer. The ChatPanel remains mounted while hidden, preserving draft text, messages, running response transport and session state. Desktop application content uses the remaining width; small screens use the available width. Existing App error isolation, Git/restart controls, Stop/Retry/New conversation and API semantics remain unchanged. The version footer is restored to its centered layout with kernel0.90, correcting the earlier footer-target assumption.

## Attachment and page bridge update

Install the locked frontend dependencies with npm ci and rebuild/reload. html-to-image1.11.13 is dynamically loaded only for page images; no global package or browser executable. Keep /api/attachments and /api/page on the existing same-origin Agent proxy, with32MiB upload bodies and long polling. Restart app loads changed backends/MCP. Local original bytes remain in data/attachments; deleting a composer chip does not erase storage. Pending composer attachments survive chat collapse, but unsent attachment selections are not restored across full page reload. Sent attachments restore from workspace. Clipboard formats depend on browser/OS: image/file payloads upload, plain text/file paths remain text.

The current main entry mounts PageContextBridge; standalone project entries need the same component if their rendered DOM is to be inspected. Source files remain available to workspace tools without extra folder permission. External resources, frames, canvas/video and font rendering have DOM-image limitations; see builder deployment guidance.

## Installed kernel version

The same-origin Agent GET /api/kernel supplies installed package metadata independently of GET /api/git. VersionFooter keeps0.90 as its original baseline/fallback and displays a valid managed manifest version after reload. No update button or mutation is performed in the browser. Use launcher menu6 for explicit offline update/recovery; see ../docs/kernel-management.html. No new frontend dependency.


## Explicit distribution version (2026-10-17)

Ship the complete source with config/release.json and the additive Agent GET /api/release. Rebuild/reload the frontend and restart changed Agent code. The footer labels Saplingagent product release, independently installed Kernel and Workspace Git version separately. Missing/old/offline metadata shows release unavailable instead of0.90. Product identity remains available without Git/authentication; a kernel-only update does not change the complete distribution declaration. No new process/dependency.

## Unified kernel version (2026-10-19)

There is one current Saplingagent version: kernel0.9.5. kernel/manifest.json is authoritative. UI, setup, Bash, packages and upgrade targets use that installed value, never a separate product number. config/release.json and JSON releaseVersion/productVersion fields are deprecated compatibility mirrors/aliases, not independent identities; source packaging verifies agreement. Kernel-only maintenance changes the displayed kernel version without touching business configuration. Missing/invalid installed metadata is unavailable in UI, not a claimed baseline. Git revisions remain source identifiers.

New comparison normalizes only historical labels0.90→0.9.0,0.91→0.9.2,0.92→0.9.3; original manifests/backups stay byte-exact. Shipped old comparators cannot understand0.9.4. Stop the app, download new tooling into an isolated .cache subfolder, then run that tooling's kernel/cli.mjs --root ORIGINAL_APP check/update with the project-local Node. Default is preview; update requires existing explicit risk acknowledgement and refuses conflicts/live targets. Never overwrite/rebaseline local core edits or regenerate a customer manifest to hide them. Source recovery remains explicit.


## Chat navigation and mathematics (TASK-20261019-055)

Run the service-local npm ci to install locked remark-math6.0.0, rehype-katex7.0.1 and KaTeX0.19.0, then build. CSS/fonts are bundled locally; there is no math CDN, global package, new server or port. html-to-image remains for page inspection. The Agent must support title PATCH and optional contextUsage snapshots; older servers still display chat/history with unavailable usage or an explicit rename error. No migrations of real conversation files or credentials are performed by this frontend.

Verify conversation switching/rename, a running snapshot, text and attachment draft roundtrips, math/GFM/currency, collapse/tab dragging and restart recovery in an isolated fixture. Clearing browser storage removes tab position and the active pointer, not server conversation data. Drafts of inactive conversations exist only in the current page; full reload preserves only the active text under the existing restart policy.
