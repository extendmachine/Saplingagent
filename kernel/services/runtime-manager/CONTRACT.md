# Runtime lifecycle and gateway contract

## Project status page (TASK-20261019-048)

The existing GET `/__saplingagent/runtime` is the lightweight launcher status page,
independent of application Vite. It refreshes every two seconds, shows project name,
installed kernel version, actual project directory/public URL, runtime phase and
managed service process IDs/ports. Running means the owned process has not exited;
it is not a continuous health claim. Overall ready means startup checks passed.
Assigned ports are configuration, not assertions that listeners are healthy.
The page stays open after restart; Open app opens the business page separately.
Restart additionally accepts optional `instanceId`; the page always sends its
observed identifier and mismatches return409, while old scope-only callers remain
compatible. This prevents stale tabs operating a different runtime at a reused port.
The HTML response pins its owning applicationRoot. A later status from another
project at the reused port disables all actions and never rebinds the old page.

GET `/api/runtime/status` preserves existing fields and adds `projectName` (read-only
config/project.json name, falling back to the folder name), `kernelVersion` (installed
kernel/manifest.json version or null), `url` and `canStop` (idle or retryable failed
shutdown). `services[].port` now also covers
built-in services, using the effective runtime port mapping; `healthCheck` identifies
process-only workers. No environment, commands, credentials or log contents appear.
Metadata reads never initialize or repair project configuration.

POST `/api/runtime/stop-and-wait` accepts exactly `{instanceId:string}` for the
instance observed by the page. After the existing busy/drain checks it waits for
owned child process termination, then returns200 `{stopped:true,instanceId}`. Only
after flushing this acknowledgement does the existing owner shutdown callback close
the controller/gateway. Busy work returns409; shutdown failures return503 and remain
retryable. A changed instance returns409 `RUNTIME_INSTANCE_CHANGED`. Lost transport
or a client timeout never establishes stopped; reconnect explicitly to inspect the
live runtime. The original POST `/api/runtime/stop` retains its202 contract. If an
earlier close failed, that legacy/Dock action retries owned termination before202
and before the owner callback; another failure keeps the controller available and
returns503 instead of permanently refusing on the closed manager's drain gate.

POST `/api/runtime/open-logs` accepts the same instance-only body and requests that
macOS Finder or Windows Explorer open only this project's existing logs directory.
It returns200 `{requested:true}` after dispatch; no folder UI visibility guarantee.
The system folder opener starts with the project parent as its working directory
so it does not retain the project directory as a rename-blocking working directory.
Paths, commands, PID arguments, query parameters and additional fields are rejected.
An unavailable/symlinked logs directory or unsupported platform returns503. All
actions keep the existing Host/Origin/script-token checks; no browser token or new
daemon is introduced. Closing the browser does not stop the project. After verified
stop the page stops polling and tells the user to reopen the native app to start it.

The operating-system launcher owns one persistent runtime manager. `frontPort` (5173) is its same-origin streaming HTTP/WebSocket gateway; Vite runs on `vitePort` (5174). `runtimeManagerPort` (4314) also exposes loopback control. The gateway survives frontend and backend restarts. No arbitrary commands, paths or PIDs are accepted through HTTP; project-owned startup metadata is read from disk.

- GET `/api/runtime/status`: instanceId, generation, phase, busy, canRestart, jobId, scope, services [{name,pid,running}], error {code,message,service?}.
- POST `/api/runtime/restart`: optional JSON `{scope: "all" | "backend"}`; defaults to all. 202 returns jobId/status. Concurrent requests share one job. All stops/relaunches frontend and all owned backends; backend preserves frontend. Generation advances only after selected components, authenticated Agent and MCP are ready.
- GET `/__saplingagent/runtime`: persistent English project-status/recovery page with status, restart choices, confirmed stop, logs-folder action and Open app. It works even if a selected older UI has no restart button or Vite fails. Non-control `/api/*` streams to Agent; other HTTP/WebSocket traffic goes to internal Vite without buffering SSE.
- Internal POST `/internal/runtime/prepare` and `/internal/runtime/release`: existing Bearer token required on each backend. Prepare atomically refuses active writes, AI, Git operations or unsaved sessions; prepared services reject new mutations with 503. Shared gate is `kernel/contracts/runtime-drain.mjs`.

While preparing/restarting, the gateway rejects new ordinary mutations. Outstanding gateway writes refuse restart; supported services also gate direct authenticated callers. Legacy versions lacking drain endpoints use Agent session-running checks and gateway accounting. This fallback cannot observe direct legacy backend callers; finish their work first. A branch switch is a separate Git operation; choose a version first, then Restart app. Dirty files are saved by the existing Git switch API. No automatic chat resend, rollback, root elevation or new MCP protections.

A disconnected browser does not complete a mutation. The gateway continues consuming
its upstream response, including when the browser left before response headers,
until that response ends or the upstream transport fails/closes. Aborted uploads
that receive no response also release their accounting when the upstream request
terminates. Each request releases its count once; browser disconnect and request
upload completion alone do not release it. This avoids both stranded busy counts
and premature maintenance while a streamed write still runs. An upstream transport
failure is not proof of business completion: existing service preparation/drain
checks remain required before any stop or restart. GET/HEAD cancellation still
closes its upstream request. No endpoint, payload or ownership rule changes.

The current checkout determines service entrypoints on every restart. PDF is optional and launched only if its source exists. Restart app applies changed internal ports while keeping the live public/control addresses. The persistent controller itself loads with the launcher; ordinary project/frontend/backend changes do not require exiting it. Dependencies newly introduced by a branch must be installed with its installer before restarting. Older frontend versions may not implement draft restoration; persisted sessions and project credentials remain on disk.

`openCodePort` defaults to 4315 and is reserved as a distinct loopback port. OpenCode remains an Agent-owned child process, so backend/all restart and Agent shutdown terminate only that owned process group. The manager passes the selected port to Agent and does not expose OpenCode directly through the public gateway.

Only manager-owned child process groups are stopped. Failed startup remains observable and retryable through the gateway, including frontend failure. Same configured loopback Host/Origin rules apply to control and proxy traffic; script mutations require Bearer authentication. No CORS or browser token exposure. Responses/logs omit credentials, conversation content and raw child diagnostics. Lifecycle deadlines bound startup/shutdown, not AI turns.

## Windows x64 candidate (TASK-20261011-030)

Native Windows10/11 x64 uses the shared kernel/contracts/local-process.mjs OS contract. Project Node and native executable dependencies remain local. App Server uses codex.exe with file credential storage; OpenCode uses its selected opencode.exe, local XDG data/config/cache/state. The manager and command cancellation stop only their owned live PID trees with taskkill /PID /T /F; POSIX detached process-group behavior is retained. Windows shell commands use ComSpec cmd.exe /d /s /c, regardless of an inherited Git Bash SHELL. HTTP/SSE/permissions remain unchanged, including Full Access. Windows forced termination is abrupt; finish active operations before restart, and externally detached programs or forced parent death cannot guarantee cleanup. Native Windows10 auth/model/restart acceptance is pending; current host checks are macOS/synthetic. Start with bash Saplingagent.sh in Windows Git Bash; platform guide ../../docs/windows-install.html. No actual credentials, global environment or running production processes are changed by this candidate.


## Ascending ports (TASK-20261014-002)

config/runtime.json ports are preferred starting values. The unified launcher selects distinct available loopback ports at or above each start (public frontPort first), without rewriting configuration or stopping occupied services. Effective ports stay fixed unless their internal preferences are deliberately edited and applied by Restart app. Public/control listener preferences apply on the next cold launch. A bind race on public/control listeners retries upward; a later internal bind race is reported for retry, never resolved by killing another process. Port exhaustion reports PORT_UNAVAILABLE.

GET /api/runtime/status additionally returns ports containing frontPort, vitePort, runtimeManagerPort, agentPort, workspacePort, builderPort, pdfEditorPort and openCodePort. Manager-created children receive their selected existing SEED_*_PORT values plus SEED_FRONT_PORT. Host/Origin checks use actual public/control ports.

.runtime/runtime-address.json is ignored local discovery metadata: {instanceId,pid,ports,url}. It contains no token/credential/conversation. The launcher writes it atomically once listeners bind, and removes it only if still owned by this instance on normal shutdown. Diagnostics checks its instanceId against runtime status before trusting it. Stale or another-root metadata must not claim readiness.

## Complete project restart (2026-10-15)

Full restart is the default for both the HTTP endpoint and manager method. Before stopping any process, reread the current checkout's service plan. Include conventional Node entrypoints in backend/<service>/server.mjs,server.cjs or server.js, excluding runtime-manager,mcp-runtime and demand-started ai-config. Optional config/services.json registers independent projects, frontends, non-Node services or workers, and can override/disable a discovered service.

Manifest: {version:1,services:[...]}. Each service has a unique name (lowercase letters,digits,hyphens or underscores), optional enabled:false, cwd (relative to application root, default root), command (argv array, no implicit shell) OR file (Node entrypoint relative to cwd), optional args,port (preferred loopback port),dependsOn (service names),env (non-secret strings),healthPath (HTTP path; default /health for discovered services and / for registered services),healthCheck ('http','tcp' or 'process'), timeoutMs (100–300000; optional readiness deadline), and drain (opt in to the existing busy/prepare/release protocol). HTTP readiness requires2xx; JSON ready:false remains unready. A process-only worker has no assigned port unless explicitly requested. Missing entries/cwd,duplicate names,unknown dependencies,cycles and invalid manifests are rejected before stopping live services.

Project services receive PORT,SEED_SERVICE_PORT and a shared SEED_SERVICE_PORTS JSON map plus SEED_<SERVICE_NAME>_PORT variables. Name hyphens become underscores. Command/args/env support literal ${PORT} and ${ROOT} substitution. Node/npm resolve through the project's running Node runtime; other executables are explicitly configured by the application author. Existing project ports are retained where available; new preferred ports skip occupied/assigned listeners. No foreign process is terminated. Status services adds optional port and project flags, never commands, environment values or credentials.

Start in dependency order and stop in reverse actual launch order. Removed/disabled services stop without relaunch; new services join the next restart. Gateway/control stay alive. Internal configured port changes can be applied by Restart app; public gateway/control addresses remain fixed for the live instance, with new public preferences applied on the next cold launch. Errors keep recovery available for correction and retry. Successful full restart refreshes the frontend even without sessionStorage. Existing conversation/draft recovery remains best effort, without resending messages.

## Kernel maintenance handoff — product0.9.2

Kernel control routes and payloads are defined in kernel/CONTRACT.md v3. Gateway hosts the standalone control at /__saplingagent/kernel independently of Vite. Maintenance takes a synchronous busy gate, prepares drain-capable owned services and refuses active writes/tasks. On handoff failure it releases prepared gates. On accepted202, scripts/dev.mjs closes all owned app processes and exits; a separately copied detached loopback worker applies staged kernel bytes, repairs only kernel dependencies and starts the app. No automatic source rollback. Kernel runtime address may change; use worker's verified readiness URL. Shutdown callback is supplied by the process owner, never an arbitrary PID or shell command from HTTP.

## Project launcher lifecycle (0.9.3)

GET /api/runtime/status additionally returns applicationRoot (canonical absolute root). Discovery records also contain root; root/instanceId matching prevents another copied application's metadata from claiming ownership. Authenticated POST /api/runtime/stop drains work through prepareMaintenance then invokes the owned launcher shutdown callback, returning202; busy work returns409. The independent management page uses the control port and service token; it never kills by port/name. Cold-start internal bind collisions retry allocation at most8 times while retaining bound public/control listeners and stopping only previously owned children. Existing restart address stability remains; non-port failures are reported rather than retried indefinitely.

## External AI / MCP readiness (2026-10-21)

Runtime status adds `aiConnection: builtin | external-mcp`. The latter is derived only from saved `config/mcp-access.json` with both enabled and externalOnly true. In that mode the Agent HTTP service and all app services still start, but Agent readiness uses its ordinary /health endpoint rather than requiring a model login and application MCP initialization. Built-in mode retains its existing authenticated readiness. Malformed MCP settings fail with INVALID_MCP_CONFIG before replacing existing service processes. A settings change takes effect on restart. Embedded chat still requires a configured provider; external MCP conversations run in the user's external client.

External stdio MCP processes are owned by their AI clients and remain independent of Restart app and Dock Quit. Kernel maintenance rejects active MCP connections before its handoff; it never terminates the external client host.


## Project language (TASK-20261023-010)

GET /api/runtime/language returns {language,supported:["en","zh"]}. POST accepts only {language:"en"|"zh"}, persists config/ui-language.json atomically and returns the same object. Existing local Host/Origin/Bearer checks apply; invalid input400/INVALID_LANGUAGE, filesystem failure503/LANGUAGE_SAVE_FAILED. Reading uses the saved project choice, then Accept-Language, then English; reading never writes. No inference, restart or credential change. See ../../localization/CONTRACT.md.

The standalone status page and kernel controls render the shared `runtime-messages.mjs` catalog and localized error explanations. Language changes update the document in place. Embedded controls/footer accept `{type:'saplingagent:language',language:'en'|'zh'}` only from their parent at the identical origin. Receiving a message never persists or echoes it; a successful direct selector save notifies the parent. Status controls still require matching root/instance identity, and a confirmed stop halts polling. Display language never changes protocol IDs, source paths or process ownership.
