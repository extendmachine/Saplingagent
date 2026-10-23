# Kernel deployment and recovery

Current manifest version0.9.6, compatibility appApi1. Maintain this version separately from customer Git versions; keep the original baseline0.90. Stop this app before apply/restore. The launcher exposes kernel management regardless of Git storage mode. Check/preview are read-only; update requires compatibility-risk acknowledgement, creates an owned-source backup and refuses locally changed kernel files. Business extensions outside the manifest,config/runtime/services,credentials,conversations and Git metadata are preserved.

After source apply, run bash Saplingagent.sh install --repair to load changed dependency declarations, then start normally and verify actual functionality. An update can break modified apps, imports,dependencies or integrations despite manifest compatibility. No universal compatibility guarantee and no data migration. Startup readiness and model/account behavior are separate checks.

Restore a listed backup explicitly through kernel restore <id>. If the new launcher is broken, run the project Node executable followed by .runtime/kernel/recover.mjs <id>. The helper is copied from the previously running updater before source writes. It refuses unrelated source edits; inspect/reconcile those deliberately. After restore, repair dependencies and restart. Backups include only owned source/modes and metadata; they are not a backup of conversations or external databases. Nothing auto-rolls back, erases user data, rewrites Git or deletes old backups. Interrupted writes retain a journal and report their backup ID for recovery.

Maintainer: node kernel/build-manifest.mjs --maintainer to regenerate versioned hashes before release; --check validates checked-in ownership/digests. Do not regenerate on recipient custom changes just to bypass conflict detection. A new public kernel is available only after its checked manifest/files are deliberately promoted to release. Older releases without this manifest report unavailable. Packaging includes kernel/ and the recovery helper, excluding installed state/logs/private files.

Check downloads staged plans under .runtime/kernel/plans without touching application source. Plans/backups consume local disk space and are not automatically pruned; remove obsolete plans only when no maintenance operation is running, and retain the recovery backup until verification. The operation lock coordinates this launcher/updater, not arbitrary editors or direct service starts. Finish other source edits and stop separately launched project services before maintenance. Existing live runtime PID checks are deliberately conservative; inspect stale discovery/locks rather than deleting them automatically.

## Application ownership boundary (schema2)

Chat UI, workspace/context, page building/reading, MCP runtime and all default/custom Skills/plugin registrations are outside kernel updates. Application entries/styles/build settings and frontend dependencies also stay application-owned; core controls and AI configuration/engine adapters remain kernel. Full source distribution still includes those application modules. Kernel source/schema changes do not remove their files or require restoring their defaults. Runtime registration/readiness contracts remain relevant if users replace services.

The earlier broad prototype used schema1; both directions of automatic schema1/schema2 update are refused before source writes. First install the new complete management tooling with its reviewed schema2 baseline; inspect prior local core changes instead of blindly regenerating hashes. Old broad plans/backups cannot be applied/restored by the current manager, including a backup of a schema1 manifest. Reconcile legacy source deliberately without overwriting application modules. All later schema2 updates/backups follow the normal explicit source-recovery workflow. Installed version/baseline stays0.90; schema revision does not invent a new kernel release.


Product distribution versions are declared separately in config/release.json and verified through contracts/release.md. Independent kernel updates preserve that declaration and do not claim the whole application was upgraded. The shared release metadata reader belongs to the kernel tooling; the application-owned Agent HTTP route is additive and may be unavailable in an older customized app. Kernel version/baseline remains0.90.

## Web deployment v3

Fresh0.9.2 installer installs kernel/package-lock.json into kernel/node_modules, independently from application dependency declarations. AI setup builds with kernel's Vite/React. No global install or customer Git change. Direct control URL /__saplingagent/kernel works while app Vite is down. Upgrade stages before shutdown, then a copied temporary worker survives runtime exit, repairs only kernel dependencies with project Node/npm and starts scripts/dev.mjs. Check actual runtime readiness and new selected URL. Source apply does not imply account/model readiness. Worker failures remain visible with manual restore/retry; no automatic rollback. A crashed worker lease must be inspected before manual cleanup.

Schema2/0.9.1 cannot auto-transition: use a new complete0.9.2 folder and deliberate customer app/data/config migration; preserve the old folder. Do not regenerate its baseline. Native Windows process survival, install/login/restart still requires hardware acceptance; macOS tests are not Windows acceptance.

## Customer-local launcher / product0.9.3

Kernel0.92/schema3 adds the project-local compiler and setup management. Native launcher source and lifecycle adapters are core-owned; customer config/project.json,config/project-icon.png,generated .app/.exe,Go toolchain/cache and compiled receipts are recipient-owned and never included in the source manifest. Installer prepares core first; setup builds app and native launcher on explicit action. Full Access unchanged. Local Go1.27.2 downloads use pinned official SHA256/size; caches and binaries remain inside the project. Ad-hoc signing is only for the customer's local Mac executable, not Developer ID notarization. Native Windows file replacement and folder renaming need real hardware acceptance. See launcher/CONTRACT.md and ../docs/project-launcher.html. Main development version0.9.3 is not a public release promotion.

## Repair for0.9.2 check: INVALID_KERNEL file entry

The first0.9.3 release introduced contracts/project-launcher.mjs outside the singleton paths recognized by0.9.2/schema3. The corrected release places its public facade at kernel/launcher/public.mjs, inside the previously recognized kernel prefix. Once that fix is promoted to release, an unchanged0.9.2 updater can check/stage/apply it normally; do not edit the old validator, disable checks, overwrite app/data or regenerate the customer's baseline. Stop the app before the explicit CLI apply, review conflicts, then repair kernel dependencies. A kernel-only update preserves config/release.json, so an existing product0.9.2 may correctly report Kernel0.92 after upgrade.

Original0.9.3 installations can update with their original validator. Their older copied .runtime/kernel/recover.mjs did not recognize the old facade path; if that helper rejects the resulting backup entry, use the corrected installed kernel/recover.mjs explicitly instead. Preserve the backup; do not remove its entry or bypass recovery validation.

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

For maintainer publication only, regenerate/check kernel/manifest.json after all source changes. Old customer core customizations must be reviewed before apply; relocation never authorizes overwriting them.

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


TASK038–040: configuration helpers are direct siblings of the canonical project,
not OS-temp copies. Ensure the project parent is writable. Complete setup and wait
for the matching cleanup receipt; do not manually delete a live helper. Project
cache/temp/config output remains local and direct installer/login entrypoints use
shared operation leases. Preserve stale/unknown ownership records for inspection.
This changes placement within kernel0.9.4; existing old external sessions should
finish through their original process before updating. No automatic customer
baseline regeneration or account/Git rewrite. See docs/configuration-storage.html.

## External AI / MCP

Install/repair includes the pinned MCP SDK in kernel dependencies. Enable External AI / MCP in web setup and export client JSON after the final folder name is established. External-only mode needs no built-in account. The external client starts the local stdio process; no extra HTTP port or global client configuration is created. Disconnect this project's MCP connections before kernel update/restore, project rename or dependency repair. See `services/mcp-access/DEPLOY.md` and `../docs/mcp-access.html`. Kernel version is0.9.6; Git SHA identifies the exact source.

### Language resources and maintenance handoff

The independent maintenance worker copies its full localization module closure before applying source. Its same-origin language selector writes only the active project's shared preference. Kernel, status and maintenance pages use English/Chinese catalogs and shared error redaction; no frontend rebuild or model call is needed for those pages. The control iframe/footer changes language without navigating the host page. Keep the pre-Node Bash/PowerShell catalog files in delivered source snapshots. Existing native launchers require a rebuild for new embedded text, while their project preference remains outside the kernel update manifest.


### Bilingual interface maintenance (2026-10-23)

Keep locale catalogs and their public helpers with the kernel source. Shared-catalog changes invalidate the setup asset fingerprint; prepare the configuration page through the launcher before serving. Existing native apps need export/rebuild for newly compiled launcher behavior, then read the project's current saved language on launch. Browser language saves require the existing local origin/authentication contract; do not publish configuration endpoints. Verify locale parity, interpolation, in-flight state, request drain, both builds and copied configuration/maintenance closures before distribution. Current kernel version remains0.9.6.
