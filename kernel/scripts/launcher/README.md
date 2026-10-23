# Shared local launcher

Project module, TASK-20261013-006 / Codex / 2026-10-13. Public entry remains `bash Saplingagent.sh`; internal helpers are not separate customer launchers. No new dependencies. cli.mjs owns installation/configuration/start/diagnostics; git-storage.mjs owns the three explicit Git choices; source-update.mjs handles an explicit install/update action for saved follow mode. recipient-records.mjs initializes fresh recipient documents only once.

## Source update contract

`updateSource(root,{mode,output,isRunning})` returns `{changed,reason?,sourceCommit?,head?}`. Default output is bilingual terminal status. mode comes from configureGitStorage, not a remote URL or automatic inference. isRunning defaults to bounded TCP presence checks on project's configured loopback ports; no model request, credentials or production stop. Only follow-mode current upstream-tracking branch is fetched, without tags/other branch refs. Local/own/linked/historical/untracked source is preserved with an explicit explanation. Repair mode never calls this update helper.

For follow mode: require clean committed source and no active merge/rebase; pause if application ports are in use. Fetch the exact tracked branch; recheck HEAD/branch/working tree. Existing upstream ancestry reports current; otherwise Git2.38+ merge-tree checks whether the merge can succeed without touching index/working files. Conflicts/unrelated history/unsupported Git are reported with manual fetch/merge guidance. After a second state/runtime check, normal no-edit merge retains both histories; autostash is disabled and ignored customer files are not overwritten. No reset, forced checkout, automatic rollback, customer push/PR, source-message logging or global configuration writes. This governs an installer operation, not Agent tool access.

Source changes require a fresh Bash/OS bootstrap before dependency checks: release the owned install lock, run the complete folder's Saplingagent.sh install with SAPLING_SOURCE_UPDATE_DONE=1 only for that continuation. Windows passes its own native Git Bash path as SAPLING_GIT_BASH. Old CLI settings are not reused for a newly merged Node/dependency configuration. Version results and errors are explicit; Git/network errors hide raw stderr that may contain credentials. Git calls have bounded timeouts and fetch reports ongoing activity every15 seconds. Source merge success is distinct from dependency failure; inspect the output and retry install rather than claiming a fully completed update.

## Official references

Checked2026-10-13, public docs; no account required for documentation. Actual private upstream access requires the customer's configured Git authentication.

- https://git-scm.com/docs/git-merge-tree — non-mutating merge preflight, modern write-tree mode, conflict exit and version history. Automatic merge requires Git2.38+; legacy/manual Git flow remains available.
- https://git-scm.com/docs/git-fetch — explicit refspec and --no-tags fetch without application checkout/reset.
- https://git-scm.com/docs/git-merge — preserve local history, no-edit merge and conflict handling. Full Access remains unchanged.

Known limits: native macOS menu/input/source-reload is verified with independent fixtures; native Windows self-rebootstrap/account/runtime remains hardware acceptance. Updates do not reconcile conflicts automatically or update local/own application source. Customer records edited against changed upstream documents may need deliberate conflict resolution. A previous-version script cannot gain this behavior until its source is updated once through the documented manual workflow.


## Saved independent storage menus (TASK-20261013-009)

Saplingagent.sh rereads saplingagent.storageMode from this independent folder's local .git/config on every menu render, without Node/bootstrap. Saved local/own hides main-menu1 and rejects hidden1; Git reconfiguration omits follow choice3 and rejects hidden3. First setup/upstream/legacy existing retain current entries. Linked worktrees/parent repos do not supply the interactive mode. Inherited GIT routing/config variables cannot override the display. No history/remote/source changes occur merely by showing a menu. Explicit install --repair remains dependency recovery, without source fetch; other action numbers stay stable. Explicit SAPLING_GIT_MODE=upstream SAPLING_GIT_BRANCH=release bash Saplingagent.sh git still deliberately opts into upstream setup; this is UI guidance, not an Agent restriction. Installer first-run and failures may need repair even after a local/own choice was saved. Diagnostics/start/setup messages give a usable explicit repair command. No global/source/account/runtime change is performed by menu inspection.

## Runtime port discovery (TASK-20261014-004)

Start reads the exact loopback URL announced by its owned dev child, then checks runtime and Agent readiness through that gateway; it never claims an unrelated app on the configured starting port is its child. Browser opening/recovery use the actual port. Diagnostics reads runtime-address metadata and verifies instanceId before using its port; source-update busy checks include selected ports as well as configured starts. No new dependencies or real model request.

## Independent kernel management (2026-10-16)

Menu **6. Kernel management** and `bash Saplingagent.sh kernel` are available in every Git storage mode, including local/own storage with menu1 hidden. `kernel status` reads installed metadata/backups; `kernel check` stages an update preview; `kernel update` requires explicit compatibility-risk acknowledgement; `kernel restore <backup-id>` restores owned source. `--accept-risk` is the deliberate noninteractive update acknowledgement. No application Git fetch/merge/reset, remote change, push, model call or automatic startup occurs. The existing whole-source follow-mode install path remains separate.

The root startup holds the shared `.runtime/kernel-operation.lock` until runtime discovery is published. Update/restore refuse a live owned runtime and active installation. Dependency install creates its installer lock before checking this shared lock, preventing overlap with kernel apply. Inspect a dead lock's owner before removing it manually. Repair uses `install --repair`; new dependency declarations do not become usable merely because source was applied. Stop the application with Control+C before kernel maintenance; ordinary Restart app still reloads all managed application services in-page. See ../../kernel/CONTRACT.md and ../../docs/kernel-management.html.


## Code-first release identity (2026-10-17)

The Bash menu reads config/release.json; the source downloader resolves an immutable release commit before reading its declared version and stores releaseVersion plus sourceCommit in delivery.json. Source ZIP filenames include both version and short commit. Packaging and kernel/scripts/verify-release.mjs read committed metadata, never uncommitted local values. Follow contracts/release.md: freeze/check code, finalize version, main-first integration, requested release promotion, exact-commit/tag/hash checks, packages and GitHub Release, then downloaded-artifact verification. Use the owner-selected kernel version. Preserve public tags by default; correct mistaken labels only on explicit owner instruction with saved previous targets and publication evidence. Current release identity uses the unified kernel version 0.9.6; customer Git history remains independent.

## Current configuration and thin app workflow

The default shell path installs the minimal kernel, then the CLI acts as short-lived A and calls `kernel/configuration/bootstrap.mjs`. It starts external B with a self-contained configuration bundle and exits. B saves identity/AI, stops the owned app before rename, and builds the native launcher. Finish setup starts project-local A, waits for its acknowledgement and exits; A waits for B exit and removes the matching temporary bundle. Native `--launch` checks/repairs declared application dependencies, then opens the project. Only missing/changed dependencies are installed; no whole-source update, automatic account import or model prompt. `install --repair`, `configure --no-open`, and `SAPLING_LEGACY_MENU=1` remain recovery entries. See `kernel/configuration/CONTRACT.md`.

Customer launcher management uses the public kernel/launcher/public.mjs facade. It stays under the kernel prefix recognized by0.9.2/schema3 updaters; do not introduce new singleton contract paths into a supposedly compatible update manifest.

## Current kernel version

The Bash menu/downloader now read kernel/manifest.json; kernelVersion in delivery receipts is authoritative and releaseVersion is the same compatibility alias. Build/package/config metadata mirrors are checked against that one version (currently0.9.6). Previous product/kernel distinction notes above are historical. Old updater transition: docs/kernel-version-migration.html.


## Personal Claude subscription startup (2026-10-22)

A saved Claude subscription profile is checked through the shared Claude credential contract before startup. It does not require Codex login and never falls back to it when its own token is missing. Runtime/Agent readiness checks still apply; saving a token is not proof of model quota or inference.
