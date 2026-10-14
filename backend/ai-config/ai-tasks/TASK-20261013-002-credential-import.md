# TASK-20261013-002 — Explicit credential import

- Executor/coordinator: Codex/root, 2026-10-13.
- Scope: AI configuration; backend/ai-config source, tests and Markdown contracts/service/deployment/references.
- Sequential detached worktree: .worktrees/auth-import, based on main867c590.
- Authority: original .worktrees/coordination/AI_TASKS.md and TODO.md.
- Public rules:2026-10-12.1. Latest frozen source/merge IDs are recorded in authority after commit; this candidate does not contain its own future SHA.

## Goal and implementation

Codex local login/upload and Claude local/upload API credentials; bounded shape validation, private storage/default/ledger, stale revision/replacement/lock and OAuth coordination.

User authorizes implementation; owner standing rule04 exception allows appropriate self-checked main synchronization/push without another approval. Other named branches stay unchanged. No prior Anthropic approval supplied: Claude API credentials only, no third-party claude.ai subscription/keychain/.credentials.json import or credential helper execution. Codex file login is copied into project-private auth; source unchanged, official sign-in remains available for keychain-only/desktop-only login. No changes to chat/MCP Full Access or provider protocol/session binding.

## Verification

24 configuration/upload checks pass (22 backend including existing OAuth/config API and12 new credential regression checks;2 browser-file helper tests). All67 project script checks pass,10 environment-specific conditions skipped; after adding unset caller-home coverage, affected Mac suite rerun. TypeScript and standalone Vite production build pass. Actual browser against an isolated project/source-home verified local Codex import, upload conflict, explicit replacement/repeated same file, local Claude API settings/custom URL, API JSON upload/custom URL/model, refresh persistence and both languages. Synthetic fixtures only; no actual user account, global settings/keychain, inference or paid quota tested. BOM decoding test expectation corrected to standard File.text behavior; old launcher fixture expectation updated for intended source discovery, with project auth isolation assertion retained.

## Storage and limits

POST /api/config/credentials/import follows the service contractv1.1,32KiB document/64KiB HTTP body, required current revision, explicit replacement, exclusive private writes and OAuth/import coordination. Uploaded text stays out of React/browser storage, public state, logs and Git. Credentials/ledger/profiles are individually atomic; I/O failures require inspecting actual state, not assumed whole-operation rollback. Saving is local storage validation only. Native Windows10, actual token expiry/model/provider acceptance remain unverified. No new dependencies.

## Handoff

Open bash Saplingagent.sh → Configure AI. Codex: account panel → Use local Codex login / Upload auth.json. Claude: Claude API → fill URL/model as needed → local API import / JSON upload. Explicit form URL/model overrides document hints. Existing credential replacement needs the checkbox. Finish setup, restart a running app, new conversation. Source package must include new module/helper and all rules while excluding local-secrets/cache/runtime and developer records. Follow API guide and backend/ai-config/REFERENCES.md; no additional merge confirmation required in this maintainer repository. Human acceptance not performed.
