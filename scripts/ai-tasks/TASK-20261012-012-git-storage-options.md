# TASK-20261012-012: Three Git storage choices

- Executor/coordinator: Codex/root; created 2026-10-12.
- Project-level launcher/documentation task; no service source/protocol change.
- Source: detached .worktrees/git-storage-options from main edf46034bb1211ff6f4a8b84c5f0f3231f8c1879.
- Authority: .worktrees/coordination/AI_TASKS.md and TODO.md; public specification2026-10-11.1 from project root.
- Latest submission at handoff: uncommitted; final frozen SHA and package checks are recorded by authority after commit.
- Status: implementation/self-check complete; pending exact-version human acceptance and main/release synchronization.

## Requested behavior

The user clarified that choice3 means the original follow-author-release mode. The Git storage submenu now contains only1 Local only (Enter default),2 My own remote,3 Follow Saplingagent release. Removed4 keep-existing and0 cancel from this submenu only; the root launcher keeps Diagnostics and Quit.

Choice1 initializes a new local repository if absent (release unless explicitly configured). Existing repositories retain files, staged/untracked edits, commits and current branch/detached version while ALL remote links are removed, including custom origin/upstream/mirror links. A stored ownRemote value is also cleared. This removes local remote configuration; it does not delete repositories on the hosting service.

Choice2 connects the explicitly supplied credential-free URL as origin. It replaces every origin fetch URL and removes old separate push URLs so future explicit pushes use that URL. Unrelated non-author remotes remain; original author-link cleanup is retained. No remote creation, authentication, fetch or push for this mode. Customers create their hosting repository beforehand. Existing selected versions remain unless SAPLING_GIT_BRANCH explicitly selects another branch.

Choice3 retains verified-source upstream/release fetch and local snapshot behavior. Repeat/repair install retains prior saved choices, including legacy existing mode, without re-prompting. Linked development worktrees retain shared Git configuration; acceptance uses an independent extracted folder. Full Access and source-folder delivery remain unchanged.

## Scope and documents

Changed scripts/launcher/git-storage.mjs, its regression tests, project README/AGENTS/FINAL_GOAL, scripts README and platform guides, five human HTML Git/install guides, and this handoff. No main root dirty files, backend/frontend/Agent source, rules, dependencies, account state, model calls, production services or named branch refs changed. Earlier TASK010 frozen handoff remains historical evidence; current behavior is documented here.

## Checks and limits

63 script regression tests pass;4 native Windows conditional tests skipped. Includes23 actual Git storage cases: fresh initialization/private exclusion, every remote removal, staged/untracked/history preservation, explicit own URL/multiple-fetch/old-push handling, legacy saved choice compatibility, detached version, menu1–3, invalid0/4 without mutation, nested Git roots, worktree shared configuration, explicit branch failure, interrupted fetch retry and real upstream source ancestry. Existing Mac PTY and simulated Windows foreground/exit150 routing checks pass. git diff --check passes.

Native Windows10 installation/customer remote authentication and real model use remain unverified; no frontend change needs a new React build. Final package hashes/all rules and isolated Bash checks are recorded by authority after freezing. Human acceptance of earlier a7b439f0 does not approve this revision.

## Human acceptance / continuation

Run bash Saplingagent.sh --lang zh git in the independently extracted candidate folder. Only1,2,3 should appear. Choice1 creates local history and gives empty git remote -v; if remotes exist it removes them while HEAD/source/pending changes stay. Choice2 requests your own URL and configures origin without publishing. Choice3 follows author release, requiring network. Repeat installation retains saved mode. Enter selects1; root menu Diagnostics/Quit remain. Confirm the exact frozen candidate before main/release merge/push under rules04/09; leave testcode unchanged.

## Sources

Existing official reference: https://git-scm.com/docs/git-remote (local remote configuration; no third-party API added). Current source implementation and native Git fixtures determine the behavior. No new external platform integration or dependency.
