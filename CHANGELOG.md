# Saplingagent changelog

## 0.9.5 — Project-relative configuration and safe handoff

- Run the complete configuration website and its helper in a visible, session-owned sibling folder (`../sapling-config-*`), with canonical source retained under `kernel/`.
- Derive managed configuration, dependency, cache and temporary output paths from the project; do not fall back to global home or system temporary directories.
- Coordinate setup, installation, login, native compilation and credential-ledger writes with ownership locks. Wait for owned processes to exit before rename, binary replacement and helper cleanup.
- Keep the native app small: check/install missing or changed local dependencies, then start the application. Preserve customer code, credentials, conversations and Git.
- Declare one kernel version, 0.9.5, consistently across the manifest, setup/controls, installation and source-package metadata. Existing tags and GitHub Release attachments are unchanged by branch promotion.

## 0.9.4 — Unified kernel version and contained source (owner review)

- Keep platform implementations, independent project/AI setup website, engine adapters, runtime manager and installer/build helpers under kernel/.
- Preserve application-owned chat, pages, MCP, Skills, configuration and data; ordinary app features use public kernel contracts and service registration. Full Access is unchanged.
- Retain thin legacy entries and Node-version metadata for existing native launchers. New launchers read canonical kernel defaults.
- Keep schema3/layoutVersion1 and explicit recovery/conflict review. Manifest path validation remains compatible; old numeric comparators require the documented one-time new-tooling transition.
- Kernel0.9.4 is the only Saplingagent version, authoritative in kernel/manifest.json. Remove dual product/kernel UI; legacy wire fields are aliases. Real Windows/account/model acceptance remains separate; no new GitHub Releases tag/assets publication is implied.

## 0.9.3 — Customer-local project setup and launcher (source distribution)

- Repair0.9.2 kernel-update compatibility: keep the launcher public facade under an already recognized kernel path and regression-check the shipped legacy validator.
- Install a local management kernel first and continue project name/icon/AI setup in the browser.
- Compile named macOS/Windows launchers locally with a pinned checksum-verified project-local Go toolchain.
- Explicit independent-folder rename, async progress, staged artifact replacement and unchanged-launcher reuse; preserve app/data/Git and previous usable output on failure.
- Root/instance-aware management, app open/restart/stop, and bounded startup port-conflict retry.
- Kernel0.92/schema3; product and customer identities remain separate. Release-branch source available; GitHub Release assets and tags are managed separately. Windows native acceptance remains pending.

## 0.9.2 — Git-free application and independent web kernel maintenance

- Fresh release snapshots do not initialize Git, select storage, connect remotes or merge application source. Existing customer Git is retained.
- Default page replaces Git/workspace controls with independent kernel/restart controls. User application pages, chat, MCP, Skills, demos and app dependency manifests remain editable and outside updates.
- Kernel0.91/schema3 has its own locked engine/setup dependencies and a built-in control independent of application frontend builds.
- Upgrade stages and verifies an immutable official release, drains tasks, hands off to a copied temporary worker, backs up/applies core, repairs core dependencies and restarts the complete app. Progress, retry and explicit manual recovery survive old runtime shutdown; no automatic rollback.
- Schema3 refuses obsolete baselines/plans/backups.0.9.1/schema2 users transition deliberately with a complete new0.9.2 folder; retain originals and reconcile app/data/configuration.
- Product release, independently installed kernel and user Git remain separate identities. Native Windows/model acceptance is not implied by synthetic/macOS checks.

# Changelog

## 0.9.1 — Explicit release identity (2026-10-17)

- Declare the product distribution once in config/release.json; show it separately from Kernel0.90 and customer Workspace Git history.
- Add read-only /api/release metadata, with explicit unavailable state instead of an old product fallback.
- Include product version and exact source commit in download receipts and source ZIP filenames.
- Verify committed code/main ancestry, release version, kernel hashes and exact tag target before publication. Use the owner-selected v0.9.1 release and correct erroneous public labels only with explicit owner instruction and saved provenance.
- Record actual checks/publication separately; native Windows and real model-account acceptance are not implied.

## Unreleased — Independent AI configuration

- Open a standalone bilingual local configuration page from the Bash launcher's Configure AI menu after installation.
- Sign in through official Codex browser/device-code authentication or save named custom Codex/OpenCode endpoint/protocol/model/API-key schemes.
- Keep keys private and retain blank-key edits; support optional model catalog discovery, scheme editing/default selection and Finish setup returning to the launcher.
- Start the selected OpenCode or API scheme without requiring ChatGPT login; preserve conversation bindings and current-user Full Access.
- Exact-version human review, real OAuth/provider inference and native Windows10 acceptance remain pending.

## Unreleased — Windows and automatic device installation (2026-10-11)

- Detect native Windows x64/ARM64 and Mac Intel/Apple Silicon automatically, including emulated terminals and Rosetta.
- Use one bilingual Saplingagent.sh entry on Mac and Windows Git Bash with project-local checksum-verified Node and shared install/configuration.
- Use native Windows Codex/OpenCode binaries, npm JS and owned PID-tree shutdown for restart/cancellation.
- Add English/Chinese Windows guides and clean Windows source ZIP packaging.
- Keep Full Access unchanged. Native Windows10 installation/login/model/restart acceptance pending.

## 0.1.0 — release candidate

- Start with a local React chat page and build application features through conversation.
- Stream official Codex App Server responses with GFM Markdown, session recovery, stop/retry and progress-based inactivity reminders.
- Provide 15 project MCP tools, 3 reusable Skills and current-OS-user Full Access.
- Keep local Git version controls and preserve old branch histories.
- Install pinned Node/Codex and locked dependencies inside the application folder on macOS 13.5+.
- Use each recipient's own Codex login; no shared developer credentials.
- Ship English UI, status/error messages, installers, project documentation, rules and Skills.
- Add PolyForm Noncommercial 1.0.0 licensing, commercial-permission notice and third-party boundaries.
- Package committed source with complete rules/Skills/license notices and SHA-256 manifests; exclude private runtime content and initialize recipient task records.

This candidate is pending exact-commit human acceptance and synchronization to main/testcode/release. No public GitHub release, commercial authentication registration, signed native application or cloud service is claimed.

## Claude Agent SDK candidate — 2026-10-12

Adds an independent Claude Agent SDK0.3.296 engine, project-local native binaries/state, API-key/custom Anthropic scheme configuration, engine/model chat selection and immutable resumable sessions. Streams, stops, errors and effective-progress monitoring reuse the current local Agent interfaces. Existing MCP/Skills and current-user Full Access are retained. The single Bash launcher installs and verifies the SDK. No claude.ai subscription login, automatic failover or real-provider quota guarantee is introduced. Candidate acceptance and main synchronization are recorded in the authoritative development index.
