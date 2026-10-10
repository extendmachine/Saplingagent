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
