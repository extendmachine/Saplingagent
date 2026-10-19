# TASK-20261019-038 — Isolated configuration fixture cleanup follow-up

Codex/sibling_configuration,2026-10-19, detached .worktrees/sibling-configuration.
Root assigned this integration follow-up after commit605a056. Authority remains
.worktrees/coordination/AI_TASKS.md. Scope is the configuration test fixture and
this record; production code and integration/customer directories are unchanged.

## Finding and correction

The fixture fallback still expected a schema1 absolute root in session.json.
After schema2 migration, a failed handoff could leave B alive while teardown
removed its files. It also could remove the root just after B exit while returning
A was still writing completion/logs and releasing locks.

Fixture cleanup now stops test-created A children first, discovers verified schema2
sessions even when a test fails before recording its capsule, checks matching
health root/instance/PID, waits for bootstrap idle and requests normal close. It
waits for B exit and returning A's cleanup/operation receipts to disappear before
removing files. If an intentionally broken entry prevents handoff, it re-verifies
session and HTTP ownership before force-stopping only that isolated test B. An
unresolved live receipt leaves the fixture intact instead of deleting its source.
A regression test hides the fixture entry and verifies process exit before removal.

Root explicitly authorized cleanup of the already orphaned fixture PID43854.
Its command, cwd and live health on port58829 matched the exact integration
flow-7Ym8yj fixture; files were already removed and normal handoff was unavailable.
That confirmed test process was stopped. A second orphan from this worktree's
prior tests, PID40544, was independently verified against flow-5u8Evn/port57638 and
stopped. No unrelated/main/customer process was stopped and no integration source
file was changed.

## Verification and handover

Run project-local Node24.21.0 --test kernel/configuration/test/*.test.mjs with root's
shared contract files temporarily available. 24 tests pass; no real model/account
calls. Confirm no running host/entry process remains under this worktree's fixture
prefix after the run. The three borrowed root contract files are excluded from
this follow-up commit and restored/removed afterward. Root cherry-picks this
independent test-only commit and reruns its combined suite; Windows native and
human acceptance remain separate. Frozen605a056 task record is preserved.
