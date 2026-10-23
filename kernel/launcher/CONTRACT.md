# Customer-compiled project launcher v1

## Project status on activation (TASK-20261019-050)

Native activation opens the kernel-owned `/__saplingagent/runtime` page at this
project's verified gateway URL. `startConfiguredProject({onRuntime})` reports a
verified live runtime while waiting for readiness, including a reused starting
instance; it does not spawn a second cluster. It also invokes the callback for a
ready existing runtime. The callback uses runtime discovery plus root/instance
verification, never preferred ports. Failed startup remains an error; losing a
connection does not prove shutdown. Browser-opening failure prints the exact
local status URL and does not stop an otherwise usable runtime.

The native startup helper consumes only the fixed stdout records
`SAPLING_PROGRESS:checking|installing|starting|status|ready|failed`; dependency output is
not the native progress protocol. Dock status retains its single phase response.
macOS retains its ordinary Dock owner and graceful Quit; Windows dismisses its
progress helper once the verified gateway/status page takes over, or when its
detached startup task finishes. The `status` phase does not claim that application
services are ready. Closing the
status webpage or progress display is not the Stop app action. The gateway's
explicit stop response confirms owned application children have exited before
its own shutdown; reopening the compiled app starts the project again.

This changes no application service registration, model authentication, Agent
permissions, configuration storage or kernel version. Updated native progress
requires rebuilding an existing exported launcher. No terminal tail or log-file
viewer is kept open across configuration handoff, folder moves or compilation.

TASK-20261018-001 / Codex. Current kernel0.9.6; original launcher implementation0.9.3. The management module is kernel-owned; project identity, icons, compiled binaries, toolchains, caches, app source, credentials and customer Git are not update-owned. Full Access is unchanged.

`config/project.json` stores schemaVersion1, projectId UUID, name, folderName and optional icon reference `config/project-icon.png`. Customer project identity is independent of the single kernel version. Names are Unicode single filesystem components,1–60characters, rejecting controls, separators, Windows reserved characters/device names and trailing dots/spaces. Existing destinations are never replaced. Linked worktrees/maintainer checkouts are not automatically renamed. Complete customer folders including ordinary customer Git can be renamed without resetting history. All processes use absolute current root and the native launcher derives root relative to itself, never a compiled developer path.

First script installation prepares only kernel/Node and opens the standalone setup page. Explicit page build installs application dependencies, builds frontend, downloads a checksum-pinned project-local Go toolchain and compiles a tiny launcher. No model prompt or login validation. Rebuild compiles to same-volume staging; checks success before switching artifacts; failure retains previous usable launcher. Ordinary app rebuild does not overwrite an unchanged native executable. Windows replacement errors retain the old artifact and report a retry; no promise of universally error-free I/O.

Protected setup routes (same-origin plus X-Sapling-Config token): GET /api/config/project returns identity, device, job, launcher receipt, runtime state. POST /api/config/project/save {name,folderName,iconData?} saves identity and optional PNG data URL <=1MiB. POST /api/config/project/build {renameFolder?:boolean} starts one async build,202; project must have an active AI scheme. GET /api/config/project polls bounded sanitized progress. POST /api/config/project/open starts/reuses this project's runtime, POST /api/config/project/restart restarts app, POST /api/config/project/stop stops owned runtime. POST /api/config/project/rename {folderName} explicitly renames offline independent customer root, relocates the live setup controller and returns the new root; failure is explicit with source retained. POST /api/config/project/reveal opens final artifact folder. UI only enables rename before build. Concurrent destructive operations fail PROJECT_BUSY; actions do not silently interrupt AI tasks. Runtime ownership requires root, instanceId and PID; copied metadata cannot claim a foreign app. Setup service itself is independent infrastructure and remains available while business services restart.

Native entry runs project-local Node and `kernel/launcher/entry.mjs --launch`, then exits, releasing its executable. Management service binds port0, publishes private-root-scoped discovery and opens browser UI/project. Existing management instances are verified before reuse; simultaneous activation is serialized by a project-local lease. No global service, machine-wide source dependency or global compiler install. Logs: logs/project-launcher/project-launcher-YYYY-MM-DD.log,30days; build job output bounded and does not include credential files or inherited credential environment. Source rollback is explicit; no automatic app/data restore. Native macOS verification and Windows actual acceptance are separate.

## Schema3 updater compatibility (TASK-20261019-001)

The public JS facade is kernel/launcher/public.mjs. New update-owned files must stay within paths recognized by shipped schema3 clients, including their standalone recovery helper. The original0.9.3 contracts/project-launcher.mjs facade prevented0.9.2 clients from validating the remote manifest; it is no longer shipped. Retain its historical ownership entry in the current validator/recovery helper to permit explicit handling of original0.9.3 baselines and backups. No runtime tool/file permission changes.

## Unified kernel version (2026-10-19)

There is one current Saplingagent version: kernel0.9.6. kernel/manifest.json is authoritative. UI, setup, Bash, packages and upgrade targets use that installed value, never a separate product number. config/release.json and JSON releaseVersion/productVersion fields are deprecated compatibility mirrors/aliases, not independent identities; source packaging verifies agreement. Kernel-only maintenance changes the displayed kernel version without touching business configuration. Missing/invalid installed metadata is unavailable in UI, not a claimed baseline. Git revisions remain source identifiers.

New comparison normalizes only historical labels0.90→0.9.0,0.91→0.9.2,0.92→0.9.3; original manifests/backups stay byte-exact. Shipped old comparators cannot understand0.9.4. Stop the app, download new tooling into an isolated .cache subfolder, then run that tooling's kernel/cli.mjs --root ORIGINAL_APP check/update with the project-local Node. Default is preview; update requires existing explicit risk acknowledgement and refuses conflicts/live targets. Never overwrite/rebaseline local core edits or regenerate a customer manifest to hide them. Source recovery remains explicit.

## Final directory before AI setup (TASK-20261019-018)

POST /api/config/project/prepare {name,folderName,iconData?,renameFolder:boolean} validates identity/icon, immediately applies the requested offline customer-folder rename, saves identity and confirms the actual final directory. When renameFolder is false, folderName records the existing physical folder. A project-local .runtime/project-directory.json binds the confirmation to projectId, current root and saved folder name; state.directoryReady is false for new/unconfirmed/moved folders or unapplied folder changes. Existing launchers can still open their applications; reconfiguration confirms Step1 before AI writes. This is setup sequencing, not an Agent file/tool permission restriction.

The configuration service serializes finalization against account/configuration operations and closes owned auth before moving. It then reconstructs root-bound stores/controllers and serves assets at the new location. Directory moves rebase only project-internal process environment/cwd and credential-ledger project location metadata, retaining external credential-import sources and credential payloads. Management discovery and lease owner both publish the current root. No automatic rollback: if a post-move metadata write fails, the current moved root remains observable and setup can retry.

Build requires an already confirmed directory and never renames. Finish setup only closes management. Explicit legacy rename remains available offline and invalidates the directory confirmation until prepare succeeds. It never erases Git/data or modifies Codex transcript contents. Existing native Codex rollout indexes can contain old absolute paths; engine resume recovery is separately bounded/identity-checked, with no blank replacement thread.

## Saved settings and external offline handoff (TASK-20261019-023)

This explicit owner workflow supersedes the immediate rename in TASK018. The setup page saves project name, desired folder, PNG icon and AI settings in their current complete folder first. `ProjectLauncher.stageSetup(input)` saves identity and `.runtime/setup-settings.json` without moving anything. `state.settingsSaved` binds that marker to the current root and identity/icon hash; AI setup can follow. Connection edits invalidate the prior restart receipt. The page tells users: finish changes, save, wait for restart, then export the app.

`finalizeSetup({management:{pid,instanceId,port},language})` requires the saved settings and verified management discovery, validates destination/ledger, stops the owned idle runtime normally and waits for its PID exit. It creates a root-local `.runtime/project-finalization.json` lease plus a closed operation-lock file, and launches a private temporary OS helper **outside** the application folder. This temporary execution is expressly owner-authorized; all canonical source remains here, with no permanent external install or developer-checkout dependency. The temporary job carries only paths, IDs and hashes, never API keys/auth payloads or copied credentials. Runtime/install/update/management entries reject a foreign or interrupted setup lease; only this job's `SAPLING_SETUP_JOB` can resume it. Never erase a stale/unknown lease automatically.

The configuration service sends the accepted202 job before shutting down authentication/management and exiting. macOS `/bin/sh` and system Foundation move tooling, or Windows PowerShell5.1/System.IO.Directory.Move, run with cwd and stdio outside the project, wait for the original management PID to exit, then move without replacing an existing destination. No project-local Node executable, setup process or owned log handle remains open during that move. External terminals/editors/sync tools can still cause a refusal; no unrelated process is killed. The source folder is retained when the move fails.

After the move, a new Node process from the actual folder runs `resume-setup.mjs`: verify the saved project/job identity; rebase only internal location metadata; preserve credentials, Git, data and original kernel baseline; install application dependencies and build pages without native compilation; start the configured application services without requiring a previously compiled launcher; verify runtime and management readiness. Management first reuses the old loopback port so the browser can reconnect with a fresh token. If that exact new attempt exits because its port is unavailable, start at an OS-assigned port and open its real setup URL. No duplicate still-live management process is spawned as fallback.

Only after both services are verified does the job write `phase:ready`, bind `.runtime/project-directory.json`, release its own lease and exit. The external helper then removes only its private temporary folder/files and terminates. Persistent sanitized status is `.runtime/setup-finalization.json`; metadata logs remain under `logs/project-launcher/`. Source preparation/startup failures record `phase:failed` and reopen management at the actual physical root where possible; no automatic rename reversal, database edit, blank conversation or source rollback occurs. A crash or denied OS operation can require inspecting the retained local lease/status; no universal file-lock guarantee is claimed.

`exportReady` additionally checks unchanged saved identity, current directory and connection fingerprint, `phase:ready`, and no pending handoff lease. Native export/build requires this state. It normally stops/drains a previously running owned app, stages/replaces the native output with the existing compiler contract, then restarts services (also after a compile failure when possible). The tiny launcher is compiled **after** restart, not during the folder move. The old internal `prepare` helper remains a compatibility function; public setup routes stage settings and use this handoff instead of in-process rename.

macOS system-process tests use isolated copies and synthetic endpoints only. Windows PowerShell source compatibility is not Windows10/11 hardware acceptance; real external locks, antivirus and user account/model behavior remain separate verification.


## Configuration document readiness (TASK-20261019-027)

`prepareSetupUI(root)` is the shared public preparation entry for Configure AI, native management, direct setup service and offline restart. It validates a source/lockfile signature and hashes of the document and every generated asset before reuse. Missing/corrupt output or changed sources trigger a project-local Vite build in kernel/.cache/setup-stage-<id>. Exclusive kernel/.cache/setup-build.lock serializes builders; an interrupted owner is reported for inspection, never silently erased. Build failure leaves the previous usable document. Publish resources first and atomically replace index.html last. Retain previous hashed assets for already-loaded documents; these caches are excluded from source distribution and may be cleared only while setup is stopped. No credentials/model call or new service.

Native management prepares the document before publishing its address. Offline resume prepares it before starting the management child/readiness deadline. This checks local UI readiness, not remote authentication. Standalone `npm run build:setup` uses the same preparation; source version changes rebuild without clearing the live page. Errors UI_BUILD_FAILED/500, UI_BUILD_CHANGED/409, UI_BUILD_BUSY/409 and UI_BUILD_INTERRUPTED/409 retain source/data and report recovery.


## External configuration capsule and thin app (TASK-20261019-031–034)

This owner workflow supersedes the earlier Save settings & restart / later Export
sequence. A configuration activation prepares kernel/.cache/configuration with a
closed backend module graph and built frontend, copies it and Node outside the
project, starts B and exits. B keeps the same local URL during saves, offline
rename and native compilation. Settings and app output remain in the project;
stores are rebound to its actual root. Save & build app closes owned auth and
project processes, waits for release, moves without replacing a destination and
compiles the small launcher. It does not install/build business pages at this step.
Finish setup starts the project-local A, waits for takeover acknowledgement and
exits. A waits for B exit and removes only its verified external capsule.

Normal .app/.exe activation checks Node and declared dependencies, installs only
missing/changed local groups and starts the application. It does not automatically
open another configuration capsule. Native Windows uses the shared PowerShell
bootstrap if Node is absent and does not need Git Bash for daily activation. A
failed install does not claim application readiness. Retain the complete source
folder. No global installation, model call, credential/Git rewrite or automatic
rollback. See configuration/CONTRACT.md and launcher/DEPENDENCIES.md.

## Project-relative managed storage (TASK-20261019-039)

All new Saplingagent-managed installer, launcher and compiler outputs derive from
this project's actual folder. Configuration B uses the expressly selected sibling
capsule described in `kernel/configuration/CONTRACT.md`; the older offline restart
helper similarly uses `../sapling-setup-<random>/`. There is no global temporary
folder fallback or arbitrary external helper-parent override. Internally resolved
absolute paths remain process ownership metadata, not user-selectable write roots.
The sibling's temporary directories are private; the legacy helper verifies its
job/directory identity before deleting only that directory. Unknown/interrupted
receipts remain available for inspection. Windows cleanup retries sharing violations
after releasing owned handles; it does not kill unrelated programs.

Native app launch and both OS runtime bootstraps set project-local temporary and
cache paths before downloads or execution. Launcher builds reset inherited B
Node/XDG caches to project-local locations. Go's pinned compiler telemetry uses a
private `.cache/go-telemetry/` directory with an `off` marker; no global Go mode is
changed. Existing account source locations remain read-only import sources.
Launcher-managed directories reject links/junctions pointing outside the project;
this is output-path handling and does not restrict Agent Full Access.

Native compilation holds both `.runtime/launcher-compile.lock` and the shared
`.runtime/kernel-operation.lock`. It refuses install/maintenance and foreign setup
leases. Configuration B may compile only with an explicit matching setup ID owned
by the same PID. Lease handles are closed before subprocess execution. Cleanup checks the exact
created device/inode, including partial initialization failures; replaced files are
retained. Original write errors remain observable instead of being masked by parsing
an incomplete owner record. Rename paths check the compile lease; atomic staged
replacement preserves the previous artifact on failure. Stale leases are reported,
never guessed away. Windows native file locking still requires hardware acceptance.

Native and both OS bootstrap entries also override inherited `NODE_COMPILE_CACHE`
with `.cache/node-compile/` and bind all XDG directories before the first Node
version probe or script starts. Setting these only inside JavaScript is too late
for Node's startup cache. Redirected cache paths are rejected before invocation.


## Ordinary macOS Dock lifecycle (TASK-20261019-043–046)

The customer-compiled macOS bundle is an ordinary, stay-open Dock application. It
uses the system applet runtime and a small Go helper; the browser remains the app
interface and runtime-manager retains the same service cluster. Reopening an app
reuses its native owner and project runtime. Quit / Command-Q asks the public
launcher bridge to cancel in-progress preparation and stop the verified project
cluster; it exits only after shutdown succeeds. A busy/refusing/unverifiable
backend keeps the Dock app available with an error. Closing a browser is not Quit.
Force Quit, crashes and power loss cannot execute this graceful lifecycle.

`entry.mjs --dock-start|--dock-open|--dock-status|--dock-stop --dock-pid PID
--dock-nonce UUID` is the local native-helper protocol. Start/open may prepare
dependencies and return after readiness; native UI runs this asynchronously.
Status returns starting/ready/stopped/failed/handoff. No provider keys are passed
as arguments. Project-local native-app owner/state/request records bind project
identity, directory identity, exact app executable, PID start identity and nonce.
A short exclusive native control lease serializes registration, startup claims and
stop/handoff requests. Stable startup PID identity survives status completion so
maintenance waits for actual process exit, including final cache/log handles.
Unknown/stale ambiguous ownership is reported rather than guessed away.

Process identity queries run macOS `/bin/ps` with child-only `LANG` and `LC_ALL`
set to `en_US.UTF-8` (TASK-20261019-052). Finder can omit locale variables,
causing `ps` to escape a Unicode executable path; inherited time locales can
also change the start timestamp. The fixed query locale preserves the actual
path and a stable English timestamp without changing the application's or OS
environment. Exact executable, timestamp, project and nonce checks still apply.
This JavaScript bridge fix also serves existing exported apps without rebuilding
their native binaries.

`closeDockForMaintenance(root, {timeoutMs})`, exported by launcher/public.mjs,
requests startup cancellation and native handoff exit, waits owned worker/native
processes, and removes only matching receipts. It leaves a ready backend for the
existing configuration controller to stop. Configuration calls it before taking
maintenance locks and again under those locks; compilation also closes the native
app before replacing its artifact. The native host waits its own helper exit. No
application service, default port or Agent permission boundary is added.

Startup cancellation uses AbortSignal for dependency commands and retains their
normal lease cleanup. A runtime child spawned before discovery is stopped through
its actual ChildProcess ownership; early runtime setup handles signals and releases
its own start lease before exiting. An unrelated project's PID/port is never used
as a signal target. Existing compiled apps need rebuilding to acquire the Dock
behavior; a source/kernel update alone cannot replace customer-owned binaries.

Direct compilation and legacy finalization/rename also close the Dock owner before acquiring an operation lease and recheck under that lease. Folder-moving paths require the runtime to be offline at that point. Native app registration refuses maintenance leases. Failed finalization removes only its own created lease, including a partial lease when a competing operation wins. Legacy rename uses the published configuration move operation so a destination appearing during the wait is never replaced.

## External MCP configuration and maintenance (2026-10-21)

Saved enabled + externalOnly MCP settings satisfy setup completion without a model profile. Runtime health remains mandatory. The setup connections fingerprint retains the original provider hash when the MCP settings file is absent; when present, it hashes its bytes with a domain separator. Changing either saved connection invalidates readiness. Client JSON is derived from the final project path after relocation; do not persist capsule paths or edit global client settings.

Legacy rename checks active MCP receipts while holding kernel-operation.lock after the normal offline check. Current capsule finalization checks before stopping the app and again under its maintenance lease. Live or unverified ownership blocks relocation with MCP_CLIENTS_ACTIVE and releases only the operation's own leases. Dependency replacement checks after taking the install lock; server registration checks these same installer/maintenance locks. Configuration finalization also asks clients to disconnect before rebuilding; no external AI host is terminated. The terminal Start path trusts external-mcp runtime readiness and a healthy frontend, without polling built-in model authentication.

## Project language (TASK-20261023-009)

Launcher and installation UI use `config/ui-language.json` (`schemaVersion:1`, `language:en|zh`). An explicit shell `--lang` or menu choice wins; otherwise saved project language wins over the OS locale, then English. The first installation can select a language before Node exists. The Node installer saves explicit choices through the shared configuration-write lease; startup reads preferences without rewriting them. All managed writes remain project-local.

`kernel/localization/launcher-messages.mjs` is the source for Node launcher messages and generated Go/AppleScript data. Pre-Node Bash and PowerShell vocabulary lives in `installer-messages.sh` and `installer-messages.ps1`; the standalone source downloader carries its own bootstrap prompts because no kernel files exist yet. Tool/vendor stdout and low-level diagnostic details remain original text. Installer/entry errors display the shared localized summary and next action with the original error code and redacted details.

Native builds hash the catalog and embed it in Go plus the macOS `Contents/Resources/launcher-messages.json`. Existing exported applications require an explicit rebuild to receive new native messages. Language preferences are read at each activation; lifecycle tokens, nonce/PID ownership, Quit confirmation, open-handle handling and service topology are unchanged. Windows source is cross-compiled on macOS; native Windows UI acceptance must be reported separately.
