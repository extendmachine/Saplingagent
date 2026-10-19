# TASK-20261019-038 — Wait for returning fixture A exit

Codex/sibling_configuration,2026-10-19. Root assigned this test-only follow-up in
.worktrees/sibling-configuration after its integrated run exposed Node compile
cache writes at process exit, after returning A had released cleanup/operation
locks. Scope: flow.test.mjs and this record; no production behavior or receipt API
change. Prior frozen records605a056/54baaa8 remain unchanged.

The fixture instruments only its copied entry to record each actual returning A
PID/root/capsule before executing the unchanged finishConfiguration code. Cleanup
validates those fixture locations and waits for each recorded PID to exit before
removing the project. The initial A explicitly enables project-local Node compile
cache, and a regression verifies the returning A used and flushed its actual
cache before removal. No blind sleep or production completion field was added.

Verification uses project Node24.21.0 and the integrated root contract/launcher
build files temporarily borrowed into the candidate (excluded from commit).
Configuration suite:25 passed,0 failed,0 skipped. No real account/model calls;
fixture process inventory is checked after completion. Root cherry-picks this
small follow-up and reruns combined validation. Native Windows/human acceptance
remain separate. No main/release/customer modification or publication here.
