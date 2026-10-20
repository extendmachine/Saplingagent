# TASK-20261019-057 — Persist reported conversation context

- Executor: Codex/root; authoritative registration: maintainer `.worktrees/coordination/`.
- Source: detached `chat-import-workspace` from main `b14eb1689196c2181d68c276feab3c81251eeb4c`.
- Rules: `2026-10-15.1` at start and review. Scope: workspace service only.
- User request: bring the chat capabilities from the owner's coursework application into maintainer main. No customer data or source is modified.

## Contract and implementation

An optional `contextUsage` session field stores the latest trustworthy Agent measurement: safe nonnegative `usedTokens`, positive safe `contextWindow`, and a bounded parseable timestamp. Omission preserves the previous field; explicit null clears it. Unknown keys are discarded, invalid patches do not write any part of the session, and legacy reads do not rewrite data. Counts may decrease after a provider reduces context or exceed the reported window; the store makes no inference about cost or automatic compaction.

The existing per-session write queue and atomic replacement preserve concurrent title, message, request and measurement updates. Existing attachment data and immutable engine binding stay intact. The list endpoint remains lightweight.

## Verification

Project-local Node 24.21.0: `node --test backend/workspace/test/*.test.mjs` — 14 passed, zero skipped/failed. Four new behavioral cases cover disk reload, legacy/omitted/null semantics, strict malformed measurement rejection without partial writes/revision changes, concurrent updates, and authenticated real HTTP. Existing attachment, session, preference, authentication and restart-drain cases pass.

No real model, account import, production session or customer service was used. Agent event handling and browser interaction are validated by the separate integration task. Human acceptance is not claimed.

## Completion-review receipt

- Standard version: start/end `2026-10-15.1`.
- Task attribution: TASK-20261019-057, Codex/root; implementation and service checks complete.
- Actual modification scope: workspace store, contract/service documentation, synthetic tests and this handoff.
- Rule review: 02, 04, 07, 09, 12, 14 and 18; main standing authorization applies only to the maintainer repository.
- Document status: workspace contract/service and handoff synchronized.
- Verification status: 14 workspace tests passed; integration remains separate.
- Git status: detached service candidate prepared for an independent scoped commit; no customer Git or other branch operation.
- Remaining items: integrate and verify frontend/Agent together, then synchronize main under owner authorization.
