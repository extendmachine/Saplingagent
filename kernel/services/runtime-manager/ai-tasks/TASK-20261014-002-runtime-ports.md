# TASK-20261014-002 — Runtime ascending ports

- Executor/coordinator: Codex/root
- Created: 2026-10-14
- Scope: backend/runtime-manager; sequential .worktrees/runtime-auto-ports from main169e9e6
- Authority: original .worktrees/coordination/AI_TASKS.md and TODO.md
- Status: implementation/self-check; final source SHA/results/main adoption recorded in authority after freeze.

User authorizes available ascending ports and actual main startup. Runtime-manager owns numeric allocation/status and stable per-instance overrides; Agent owns effective browser/Agent origin ports; project launcher owns binding, metadata discovery, readiness/browser URL, diagnostics/busy checks and shared/human guidance. Each module gets an independent commit. config/runtime.json and occupied foreign services are preserved. No new dependency, external code/global environment modification, Full Access change, credential migration or paid model test.

Runtime metadata .runtime/runtime-address.json is ignored and contains only instanceId/PID/actual ports/URL; normal shutdown removes only its own record. Actual public/control listeners retry upward; a later internal bind race is reported for relaunch. Restart keeps allocated ports, while configured-start changes require a new launcher. Old historical backends must support the effective port environment to accept shifted browser origins; main does.

Verification includes actual foreign occupied listeners, distinct ascending ports/exhaustion, unchanged source config, real dev startup/API/control/restart/cleanup, actual-origin Agent mutations, Mac announced-URL readiness/diagnostics/foreign-instance checks, and selected-port updater discovery. An initial isolated run lacked candidate SDK dependencies; pinned local npm ci resolved that. Full regression found standalone SEED_AGENT_PORT=0 compatibility, restored and13 focused Agent checks passed. A repeated unrelated native OpenCode synthetic-stream test stalled in native networking/startup and its owned fixture group was stopped; that test passed in the initial full run and is explicitly excluded from the bounded final rerun, never reported as freshly passed. Native Windows10 and real paid model conversation remain unverified. Final exact counts are authoritative.

Source scope/document/private/generated/diff checks precede commits. Owner standing instruction authorizes main merge/push after self-checks; human acceptance is not fabricated. User separately authorizes actual root main startup with existing project login/catalog/MCP, retaining the other active Saplingagent copy. Release/adobe-replica changes are unrequested. Preserve root pending files and authority foreign prefixes.
