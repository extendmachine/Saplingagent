# Runtime deployment

The native launcher opens `/__saplingagent/runtime` at the actual allocated public
port. This lightweight page is served by the existing gateway; it needs no Vite
build, extra service or fixed port. It shows project metadata and owned process
status, not live per-service health monitoring. Use Open app for the business UI.
Restart remains on the status page. Stop app waits for owned exits before reporting
success; a lost connection means shutdown is unconfirmed. After a confirmed stop,
reopen the native app to start again. Closing a browser tab does not stop services.
Open logs requests Finder/Explorer for this project's logs folder, without exposing
log contents through HTTP. Missing log folders and failed open requests are reported.
An old page refuses a different project if the OS reuses its port; reopen the right
native app to obtain its current address. These changes require one normal cold
restart to load the new runtime controller; native activation changes require the
launcher rebuild documented by that service. Windows folder dispatch has automated
argv tests; native Windows desktop acceptance remains separate.

Launch via `Saplingagent.sh start` after project installation/login, or project-local Node `scripts/dev.mjs` for development. First adoption requires stopping the previous launcher and starting the new one once. The manager itself has no install step. Keep the launch window open.

Configured loopback listeners: public gateway frontPort5173, internal Vite vitePort5174, control runtimeManagerPort4314, Agent4310, workspace4311, builder4312, optional PDF4313. These are starting values: unified startup selects the next available distinct loopback port for each listener; foreign owners are never killed. Follow the actual URL printed by the launcher. PDF is unnecessary on main and only launched when its selected source exists. New branch/project dependencies must be installed first by the installer or the AI adding the feature; restarting does not run package installation implicitly. The gateway keeps the same browser origin during frontend/backend restart, streams SSE, and forwards Vite WebSocket upgrades.

Select a branch or historical version, then Restart app. Restart backend retains Vite. Recovery URL: `/__saplingagent/runtime`; it remains available if frontend/Agent startup fails or an older UI lacks controls. Repair the selected source, dependency installation, configuration or login then retry. Restart app reloads project/frontend/backend source, registrations and internal port settings without closing the launcher. The persistent manager/bootstrap is loaded at launch; installing a different controller version requires that version’s initial launch.

TASK-20261021-001 fixes a gateway count that could remain busy after the browser
disconnected from a streamed mutation. The gateway now drains that response until
upstream termination, while keeping pending writes and service drain checks active.
Load this change with a normal cold restart of the owned runtime; Restart app does
not replace its persistent gateway. An already stranded counter in an old process
is not reset by changing files. Inspect active work and ownership before any manual
recovery; do not delete maintenance locks or kill foreign services. No launcher
rebuild, dependency installation, application-data migration or version bump is
required for this JavaScript-only controller change.

Startup health budgets are 20 seconds per service and 120 seconds for authenticated Agent/MCP; they do not limit AI turns. Shutdown terminates only owned groups with TERM, four-second wait and bounded KILL fallback. Manual SIGKILL cannot guarantee cleanup. No automatic restoration of source or application data. Legacy direct backend callers are outside gateway accounting; finish their operations before restarting an older version. Current UI restores an unsent draft; older UIs may not. Persisted workspace sessions and credentials are retained.

## Windows x64 candidate (TASK-20261011-030)

Native Windows10/11 x64 uses the shared kernel/contracts/local-process.mjs OS contract. Project Node and native executable dependencies remain local. App Server uses codex.exe with file credential storage; OpenCode uses its selected opencode.exe, local XDG data/config/cache/state. The manager and command cancellation stop only their owned live PID trees with taskkill /PID /T /F; POSIX detached process-group behavior is retained. Windows shell commands use ComSpec cmd.exe /d /s /c, regardless of an inherited Git Bash SHELL. HTTP/SSE/permissions remain unchanged, including Full Access. Windows forced termination is abrupt; finish active operations before restart, and externally detached programs or forced parent death cannot guarantee cleanup. Native Windows10 auth/model/restart acceptance is pending; current host checks are macOS/synthetic. Start with bash Saplingagent.sh in Windows Git Bash; platform guide ../../docs/windows-install.html. No actual credentials, global environment or running production processes are changed by this candidate.

TASK-20261014-002: selected public/control ports are bound with ascending retry; internal ports are probed then passed to owned children. An internal race after probing reports a startup error and can be retried from a new launcher; existing owners are retained. Ports remain fixed for Restart app/backend. Restart app can apply internal starting-port edits; public/control changes are preferences for a later cold launch. .runtime/runtime-address.json contains actual ports/URL/instanceId/PID, never credentials. Normal shutdown removes only the matching instance record.


## Generated project processes

Use [project service registration](../../../docs/project-services.html). Conventional backend/<service>/server.mjs,server.cjs or server.js joins Restart app automatically. Excluded infrastructure: runtime-manager,stdio MCP,and demand-started ai-config. Independent project frontends, workers and other runtimes use config/services.json, with argv/cwd/dependencies/readiness specified when the AI creates them. There is no extra user startup terminal. Invalid registrations are rejected before live services stop; fix the file and retry in-page. Worker readiness is process-only; transactional services should implement the shared drain endpoints and opt in.

Kernel0.91 maintenance is invoked from the direct control page. Do not close its independent progress tab while old app services stop. Worker copies live under .runtime/kernel/jobs, logs under logs/kernel-manager. Source restore is explicit. On failure inspect its state and runtime recovery; a failed model connection is not a failed source checksum. Existing Restart app still reloads registered business services. No Git operation is needed.

0.9.3 adds project identity to runtime discovery/status, a drained control-port stop action for the native project launcher, and bounded cold-start internal bind-conflict retries. The browser management service is demand-started kernel infrastructure, independent of business restart; it delegates all business lifecycle to this manager. Copied foreign-root discovery is not this app. See ../../kernel/launcher/CONTRACT.md.
