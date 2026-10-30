# TASK-20261029-012 — AI-only configuration lifecycle

- Agent: Codex classroom_kernel_audit; 2026-10-29.
- Source: detached c926534, `.worktrees/ai-settings-lifecycle`.
- Authority: original repository `.worktrees/coordination/AI_TASKS.md`; root coordinator.
- Scope: configuration capsule modes/lifecycle, launcher entry and CLI forwarding, Windows flag routing, related contracts and tests. HTTP/UI implementation belongs to TASK013/014.
- User authorization: main implementation and customer sync requested; this agent only prepares a scoped candidate. Kernel version remains 0.9.8; no release/customer/manifest/root-record edits.

## Behavior

Mode is explicit across bootstrap, IPC, discovery, both ownership receipts and B.
Missing legacy mode means setup. Opposite-mode capsules are preserved with an
error. AI-only changes stop owned processes before writes, hold a maintenance
lease through authentication, never rename/build/initialize identity, close
authentication before finish, then clean B before existing-app/runtime restart.
Read-only close preserves running state. Restart failures remain visible and
never claim readiness or restore old credentials automatically.

## Verification

`node --test kernel/configuration/test/*.test.mjs kernel/scripts/test/shell-routing.test.mjs kernel/launcher/test/native-bootstrap.test.mjs`:56 passed, 1 opt-in compiled-native test skipped, 0 failed. Includes real external B processes, actual exit/cleanup ordering, mode mismatch preservation, fixed-root handoff, restart failure receipts, identity/launcher preservation and Windows argument forwarding. A real AI-only CLI launch preserves an existing credential ledger and does not initialize Codex config or project identity. The old closure count threshold failed after adding the lifecycle module; replaced with kernel-only import graph and explicit required module invariants, then complete suite passed. No credentials/model calls, user data, native app deployment or Windows real-hardware acceptance.

## Next

Root combines HTTP/UI candidates, regenerates official manifest once, runs integrated browser/service checks, pushes main only and separately migrates the authorized customer folder. Check exact final service integration before claiming completion.
