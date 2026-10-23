# Independent kernel package contract v3

TASK-20261016-001,2026-10-16. Kernel is project-local platform tooling; the runtime gateway hosts its control and a temporary copied loopback worker owns upgrades. Public library exports are in kernel/manager.mjs; the launcher calls kernel/cli.mjs as a separate command. Metadata and startup interlock are kernel/contracts/kernel.mjs, not another service's private implementation.

Manifest kernel/manifest.json: schemaVersion3,layoutVersion1,version0.9.6,appApi1,minNode,notes and files[{path,sha256,bytes,executable}]. Current membership is defined by isContainedKernelPath and the manifest in kernel/contracts/kernel.mjs; isKernelPath additionally recognizes historical baselines for migration and recovery. Kernel owns install/update tooling, complete process restart, AI configuration/engine adapters and their explicitly declared shared contracts. The mixed Agent HTTP/chat entry, application frontend entry/styles/build/dependency files, chat UI, workspace/context, builder/page reading, the existing application MCP runtime and all Skills/plugin registrations are application-owned. Their source remains in the complete distribution, freely editable and outside kernel update/deletion/restore. Runtime/services config,rules/AGENTS/goals/records,data,secrets,Git metadata,logs and installed dependencies remain excluded. Full Access is unchanged; membership is an update package boundary, not a tool permission boundary.

Schema3 deliberately refuses earlier schema1 and schema2 baselines, plans and backup manifests before source writes. Old updaters reject3 before treating released application modules as deletions. Use a deliberate complete-tooling transition from0.9.1; preserve originals and customer data. Never regenerate a recipient baseline to hide core edits.

kernelStatus(root) returns baselineVersion,version,appApi,sourceCommit?,installedAt?,state (managed|legacy|invalid),lastBackupId?,warning?. No secrets or conversations. Read-only Agent GET /api/kernel returns {kernel:status}. Footer displays the managed installed kernel or unavailable;0.90 is historical diagnostics only.

checkKernel/prepareKernel: resolve official extendmachine/Saplingagent release commit through public GitHub HTTPS, fetch its manifest and individual owned files at that immutable SHA, enforce hash/size/path/schema/Node/appApi compatibility. No Git fetch/remotes/checkouts or credentials. Persist candidate bytes and before-hashes in ignored .runtime/kernel/plans/<UUID>/. Return plan ID,target version/revision,changes,conflicts,compatibility warning; no source changes. Absent release manifest is KERNEL_UNAVAILABLE, not success.

applyKernel(root,planId,{acceptRisk:true}): hold shared operation lock, refuse this app's live runtime/install or changed local baseline/plan, refuse symlinks/path escapes and conflicts. Explicit risk acknowledgement is part of this update operation, not an Agent access policy. Save original owned bytes/modes/state to ignored .runtime/kernel/backups/<UUID>, retain standalone recovery helper, then atomic per-file replacement/deletion. No business/data/Git write. Journal partial failures; never report ready or auto-rollback. Last write is manifest/state. A source update is distinct from dependency repair/application readiness. CLI prints backup/recovery and dependency-repair instructions. No automatic startup or model call.

restoreKernel(root,backupId): explicit action only, hold same lock, app stopped, reject changed post-update files before restoring originals. Partial updates accept recorded before/after versions; later user edits are never silently discarded. An independent copied .runtime/kernel/recover.mjs provides recovery if new launcher/kernel fails. Source-only restore cannot undo business data migrations, external actions or guarantee dependency/model compatibility; repair old dependencies and restart/check manually.

Errors: INVALID_KERNEL/INVALID_PATH/INVALID_PLAN400; KERNEL_CONFLICT/KERNEL_BUSY/KERNEL_INCOMPATIBLE409; KERNEL_UNAVAILABLE/network errors502; KERNEL_INTEGRITY/partial I/O errors500. Report paths/status, never credentials/raw remote response. Normal metadata logs in logs/kernel-manager by day,30-day retention; no payload content. State/backups stay local and ignored, without automatic cleanup.

## v3 — Git-free distribution and web maintenance (2026-10-17)

Product0.9.2 uses kernel0.91/schema3. Default installation is an upstream release archive with no Git initialization, remote or storage menu. Existing customer Git is left untouched. Legacy Git libraries remain optional application code, outside kernel ownership. Schema3 also releases application dependency manifests and React controls. Old schema2 updaters reject3 before deletion; new updaters/recovery reject2 baselines/plans/backups before source changes. First transition requires the complete0.9.2 tooling in a new folder or a deliberate manual merge retaining application/data, not an automatic broad migration.

The runtime gateway serves the self-contained kernel control at GET /__saplingagent/kernel. Its UI and engine/setup dependencies use kernel/package-lock.json and kernel/node_modules, independent of application manifests, React build and dependencies. The default application embeds a small host; custom pages may remove it and still open the direct control URL.

GET /api/runtime/kernel returns {kernel,release,backups}. POST /api/runtime/kernel/check with {} stages official immutable release bytes and returns {plan}; this does not stop services. POST /api/runtime/kernel/apply with {planId,acceptRisk:true}, or /restore with {backupId,acceptRisk:true}, accepts UUID only, drains registered services and returns202 {jobId,url}. Existing runtime Host/Origin/Bearer checks apply. Invalid JSON/fields400,active task/operation409,integrity500,network502. No arbitrary command/source/path/PID parameter is accepted.

Handoff starts a copied temporary Node worker in .runtime/kernel/jobs/<UUID>/runner, then shuts down only this runtime's owned processes after the202 response. A project-local maintenance lease blocks competing starts/install/update while the worker waits, applies, repairs kernel-only dependencies and launches the complete app. The worker has a separate loopback ephemeral HTTP port, no model call, no Git write. Its private URL shows phase/source backup/dependency/start errors and provides explicit retry-start and restore actions with same-origin POST. It never automatically restores source. On success its page redirects to the actual newly announced gateway URL. Service readiness is checked independently from model authentication. On failure the worker remains available for recovery; explicit close releases the lease. A crashed worker leaves a visible lease requiring inspected manual cleanup, never automatic overwrite.

The page host uses same-origin postMessage: kernel-before-restart saves drafts; kernel-restarted reloads; kernel-maintenance navigates to the validated loopback worker URL. No chat resubmission. New business services still participate in Restart app via the standard discovery contract. Temporary maintenance worker is not a business service: its lease, handoff, explicit finish and successful short-lived shutdown define its lifecycle.

## Customer launcher0.9.3

Management owns kernel/launcher source and kernel/launcher/public.mjs, including customer-local compile/orchestration. It never owns config/project.json,config/project-icon.png,root-level generated launchers or .runtime/.cache. Kernel update changes compiler/source but does not silently rebuild customer binaries or rename folders. The existing native bootstrap invokes the updated editable management source; explicit Rebuild app & launcher refreshes a changed native source/icon/name. The historical separate labels are superseded by the unified kernel version below.

## Contained platform implementation (2026-10-19)

All kernel implementations, default device settings, internal commands, service contracts,
engine adapters, native launcher sources and the complete setup website live in `kernel/`.
The setup React source is `kernel/ui/setup/`; its generated assets are
`kernel/.cache/setup/`. Runtime management and AI configuration live in
`kernel/services/`, provider adapters in `kernel/engines/`, and installation/build
commands in `kernel/scripts/`. `kernel/config/` contains device defaults; customer
configuration remains under root `config/` and credentials under `local-secrets/`.

Ordinary application development should change `front/`, `backend/`, application
contracts and `config/services.json`, using public kernel interfaces. Do not edit
kernel internals to add a business feature. Explicit platform-maintenance requests
can still modify the kernel with current-user Full Access: this is organization and
update guidance, not a permission restriction or path lock.

The public root Bash entries and a finite set of old import/command paths remain
small forwarding adapters and two Node-version metadata files for existing native launchers only. They contain no platform implementation or setup
page. `kernel/compat/paths.mjs` enumerates these compatibility entries, necessary so
existing applications and the shipped0.9.2 updater keep working. New code uses
canonical kernel paths. The schema3 manifest adds `layoutVersion:1`, restricts
current ownership to `kernel/` plus those entries, and keeps historical validation
for deliberate migration/recovery. Unmodified old schema3 installations can migrate;
local core edits still cause conflicts and need a deliberate merge. Never regenerate
a customer's baseline to hide them. A contained install cannot update back to the
old distributed layout; restoring an explicit backup remains available.

## Unified kernel version (2026-10-19)

There is one current Saplingagent version: kernel0.9.6. kernel/manifest.json is authoritative. UI, setup, Bash, packages and upgrade targets use that installed value, never a separate product number. config/release.json and JSON releaseVersion/productVersion fields are deprecated compatibility mirrors/aliases, not independent identities; source packaging verifies agreement. Kernel-only maintenance changes the displayed kernel version without touching business configuration. Missing/invalid installed metadata is unavailable in UI, not a claimed baseline. Git revisions remain source identifiers.

New comparison normalizes only historical labels0.90→0.9.0,0.91→0.9.2,0.92→0.9.3; original manifests/backups stay byte-exact. Shipped old comparators cannot understand0.9.4. Stop the app, download new tooling into an isolated .cache subfolder, then run that tooling's kernel/cli.mjs --root ORIGINAL_APP check/update with the project-local Node. Default is preview; update requires existing explicit risk acknowledgement and refuses conflicts/live targets. Never overwrite/rebaseline local core edits or regenerate a customer manifest to hide them. Source recovery remains explicit.


## Directory finalization and existing Codex sessions (2026-10-19)

Customer setup saves desired identity/icon and AI settings before moving the folder. Save settings & restart stages a private external system helper, closes verified owned processes and waits for project-local executable/log handles to be released. The helper moves the independent folder, resumes from its actual root, prepares application dependencies/pages, starts services and configuration, verifies readiness, then removes its owned temporary files. Only afterward may the user export the native app; export never renames. The temporary external helper is explicitly owner-authorized, with canonical source and persistent receipts inside the complete project. Pending work is reported, unrelated processes are left alone and failures never trigger automatic rollback. Credentials, conversations, customer Git and original recipient kernel baselines are preserved. See launcher/CONTRACT.md and services/ai-config/CONTRACT.md.

For existing Codex sessions moved by older setup flows, the pinned native thread/resume path support can recover a verified local rollout after the specific missing-rollout error. The same thread ID is checked before and after recovery; no transcript rewriting, replacement thread, general request retry, global database replacement or permission restriction. Codex itself may update its index; user model calls remain separate from source/readiness tests. Preserve backups and actual history; do not regenerate a customer kernel baseline to hide local patches.


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


## Relative storage and operation ownership (TASK-20261019-038–040)

All Saplingagent-managed configuration, dependency, cache and temporary output
locations derive from the actual project directory. The sole configuration
execution exception is a session-owned direct sibling, `../sapling-config-*`,
whose canonical module stays under kernel/. No system temporary/home directory
is selected as a fallback. Internal canonical absolute paths serve OS identity
checks, never arbitrary browser-selected output destinations. Shell/native/direct
Node install/login/start entrypoints bind their managed temp and cache environment
to the project; the B process binds its own transient caches to its sibling.
The returning A rebinds to project storage before deleting B. Existing user account
sources may be read on request; customer Agent Full Access is unchanged.

Direct legacy install/login operations now participate in the shared kernel lease
and require the project offline. Setup/profile ledger writers share an exclusive
receipt and atomic publication. Live/unknown locks are retained with actionable
errors. Symlinked managed output ancestors are refused before external writes.
See configuration/CONTRACT.md and launcher/CONTRACT.md for sibling ownership,
rename, native replacement and cleanup details; docs/configuration-storage.html
is the human guide. OS-managed browser/system-tool behavior is not a project
storage promise.

## External AI access through MCP (2026-10-21)

The new standalone `kernel/services/mcp-access/` stdio endpoint and its SDK dependency are kernel-owned platform integration. It exposes eight native file/shell/context/Skills tools to an external AI with current-user Full Access, independently of model accounts and application backends. Existing `backend/mcp-runtime/`, app preferences/page tools and all Skills content remain application-owned; this addition does not migrate them into the kernel. Settings are in application-local `config/mcp-access.json`, excluded from kernel replacement.

Connected MCP process receipts block source apply, standalone restore, dependency replacement and folder relocation. Registration and maintenance coordinate through kernel-operation/install locks. Copied maintenance workers include the shared guard and its builtin dependencies; standalone recovery retains a self-contained conservative guard. MCP_CLIENTS_ACTIVE requests client disconnection, never arbitrary PID termination. Restart app and Dock Quit do not claim ownership of external client connections.

## Personal Claude subscription credentials (2026-10-22)

AI configuration additionally accepts `engine:'claude',kind:'subscription'`.
Its saved public profile contains only `id,label,engine,kind,model`; it has no
API URL, protocol or anonymous-auth option. The existing write-only `apiKey`
request field carries a manually supplied `claude setup-token` token for this
kind. Only `oauthToken` is stored in its project-local credential file. Public
state exposes `hasKey`, never the token. Empty input retains a valid existing
credential of the same kind; changing authentication kind requires a new secret.
The shared configuration contract passes `oauthToken` to the Claude adapter,
which sets `CLAUDE_CODE_OAUTH_TOKEN` and removes conflicting inherited API/cloud
settings. Missing tokens fail rather than falling back to anonymous API access.
Model discovery is not available for this kind. Saving does not call a model,
validate quota, refresh credentials or authorize third-party subscription access.
This manually configured personal/local option uses the unmodified official
SDK/CLI. Anthropic's plan and integration conditions still apply; no third-party
approval or free usage is implied. API credentials and existing profiles retain
their current behavior. Full Access and the kernel version remain unchanged.


## Project language and actionable errors (2026-10-23)

The public `kernel/localization/` contract provides keyed English/Simplified Chinese messages, shared error summaries/actions and project language persistence. Setup, runtime controls, install/launcher surfaces and independent help use it; application UI keeps its own catalog under `front/`. Browser APIs store only `config/ui-language.json` under the existing configuration-write lease and runtime drain gate. Preferences belong to customers, stay outside kernel replacement/source packages and persist across ports. No language change reloads a model, rewrites conversations or changes tool permissions. See `localization/CONTRACT.md`.
