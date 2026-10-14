# TASK-20261013-009 — Independent customer storage menus

- Execution AI: Codex/root
- Scope: project-level launcher/storage UI and recovery wording; no microservice change.
- Created: 2026-10-13
- Worktree: .worktrees/independent-menu (detached from main90c8c3c)
- Authority: .worktrees/coordination/AI_TASKS.md and TODO.md
- Status: implementation/self-check completed; source SHA and main adoption recorded in authority after freeze.

## Requested behavior

After saving local or own Git storage, subsequent Saplingagent.sh menus omit Install / update and storage reconfiguration omits Follow release. First install/upstream behavior remains.

## Implementation and limits

Root Bash menu reads only the independent folder's local saplingagent.storageMode on every redraw, without Node/download/bootstrap or inherited GIT routing/config overrides. Linked worktrees/symlink Git directories/parent repositories do not supply display state. Saved local/own hides1 and guards manual hidden1 input; storage prompts omit3 and reject it. Other numbers/language selections remain. Explicit install/install --repair and explicit upstream mode still work. Recovery errors/diagnostics identify the dependency repair command rather than referring to the hidden menu. The choice itself remains in .git/config; no preference migration/history/remote change from menu display.

Scope Saplingagent.sh, shared CLI/storage helper, focused tests, README/internal launcher/OS Markdown and five human HTML guides. No new dependencies/frontend/backend/API/Skills/MCP or Full Access changes. No automatic source fetch from independent menus, user credentials/model calls/global code edits or real service restart. All customer files and history are preserved unless the user explicitly chooses the preexisting local-reset operation.

## Verification

91 script checks pass;10 Windows conditional checks skip. New checks cover bilingual saved local/own menus and hidden digits, unchanged empty Git/config/remotes, initial/upstream/legacy entries, immediate mode refresh, parent/inherited routing isolation, explicit repair and deliberate upstream opt-in, Windows routing and actual macOS controlling-PTY display without Node bootstrap. Existing native Mac first-install input and source/fresh-launcher update checks still pass. Bash syntax/diff/private/generated/document screening pass. No frontend build needed or claimed. Real Windows10 native display/install and actual recipient acceptance remain unverified.

## Authorization and continuation

User requests these menu changes. Owner rule04 standing authorization permits appropriate self-checked main merge/push; human acceptance not performed. Other branch synchronization is not authorized by this request; release/testcode retained. No publication of hosted artifacts, tags or inference. After freeze, record final SHA, main merge and push verification in the live authority without modifying this handoff.
