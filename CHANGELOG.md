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
