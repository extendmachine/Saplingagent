# TASK-20261012-006 — Claude Agent integration

- Executor: Codex/root, sequential scope.
- Source: detached .worktrees/claude-agent, baseline main cee0fcfba95ea7a600164d5f232182e8612f048e.
- Scope: Claude API-only/Anthropic validation, private key retention/ledger and catalog discovery. Existing account flow remains Codex only.
- Public rules:2026-10-11.1. Authoritative records: .worktrees/coordination/AI_TASKS.md and TODO.md, not this snapshot.
- Implemented and self-checked; exact candidate commit is recorded in the authoritative index after freezing. Human acceptance/main synchronization pending.

## Verification

Agent/config/workspace regression suites, front hook/stream/recovery and launcher/OS tests, TypeScript and both Vite builds. Native macOS SDK checks use synthetic credentials and a local fake Anthropic API; verify /v1/messages/auth header, text deduplication, persisted resume and no inference during startup. Actual project MCP initialization exposes15 tools and3 existing Skills. No real account, provider quota, paid model, external source edit, production restart or main push. Windows package metadata/path/process tests do not replace native Windows10 acceptance.

## Handoff

Use the independent setup page, choose Claude Agent / Anthropic Messages with your own scoped API key/custom Base URL and exact model ID; finish setup, restart and start a new chat. Existing sessions stay bound. Native question/elicitation forms are not rendered; ordinary chat questions are used. Full Access is current-user access, not root. Missing sessions/errors are surfaced without silent fallback or resend. Source package includes all rules/Skills and excludes runtime, private keys/transcripts, installed binaries and developer records.

User should test the frozen candidate and explicitly approve before rules04/09 main adoption. Keep the candidate/source commits and update only the authority after freeze; do not mutate tested source to backfill approval.
