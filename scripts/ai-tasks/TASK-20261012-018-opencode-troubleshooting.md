# TASK-20261012-018 OpenCode troubleshooting docs

- Executor/coordinator: Codex/root,2026-10-12.
- Source: detached .worktrees/opencode-message-role; separate project doc commit after Agent TASK017.
- Authority: .worktrees/coordination/AI_TASKS.md and TODO.md. Exact frozen SHA/main result recorded there.
- Scope: README.md, docs/ai-configuration.html, docs/api-interfaces.html and this handoff only. No launcher/frontend/backend implementation, secrets/history or external source changes.

Explain the internal-context echo bug, native role/parent attribution, unchanged public SSE/Full Access, update-source versus dependency repair, required backend/app restart and clean new conversation. Preserve existing data/credentials; do not use Git reset or reinstall as history repair. Main receives owner-authorized fixes; release downloads change only after explicit synchronization.

Verification: documents agree with Agent CONTRACT/DEPLOY; HTML parsing and git diff --check pass. Agent86 tests pass plus actual isolated browser send/refresh/continue. No actual customer API/Windows10 acceptance, no human test-pass claimed. Public rules start/end2026-10-12.1;02/04/06/07/08/09/11/12/14/15/18 reviewed. Owner instructed self-checked main synchronization without another confirmation. Other branches remain unchanged. Official https://opencode.ai/docs/sdk/ and /docs/server/ reviewed2026-10-12. No schema/dependency change; frontend build is not needed for Markdown/HTML and backend-only changes.
