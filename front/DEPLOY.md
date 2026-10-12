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
After choosing a branch or historical version in Versions, click **Restart app** to reload frontend, backend, Codex App Server and MCP. The adjacent options provide **Restart backend** and **Runtime recovery**. Busy AI/file work refuses restart. The current frontend stores only a temporary unsent composer draft in sessionStorage for reload, restores the same session and removes that recovery copy; persisted messages stay in workspace. Older versions may not implement this draft support. The fixed recovery page `/__saplingagent/runtime` remains available through the gateway. First adoption and manager/port changes require stopping the old launch window and starting the Mac launcher.

## Independent AI configuration entry

After installation run `bash Saplingagent.sh configure` from the root. The launcher builds front/ai-config/vite.config.mjs with existing locked frontend dependencies to .cache/ai-config-ui, then the separate configuration service serves it before chat starts. No main Vite proxy or current Agent dependency. English/Chinese controls follow the launcher. Finish setup stops only setup and returns to the launcher; restart an already-running chat and create a new conversation to apply saved engine/provider changes. API keys never enter browser storage or public build variables. Real account sign-in and native Windows browser acceptance remain pending.
