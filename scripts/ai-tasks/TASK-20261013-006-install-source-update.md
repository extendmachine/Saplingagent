# TASK-20261013-006 — Responding install/update and upstream source updates

- Executor/coordinator: Codex/root,2026-10-13.
- Project scope: Saplingagent.sh menu progress; shared cli/storage/source-update/recipient guidance; Windows own Bash path for fresh-bootstrap continuation; isolated script tests and English/bilingual install/Git guides.
- Sequential detached .worktrees/install-update from main631e928. Authoritative records original .worktrees/coordination/{AI_TASKS,TODO}.md. Public standard2026-10-12.1. Frozen source SHA/main merge are recorded by authority after commit, not backfilled here.

## Report and confirmed cause

User reports macOS Terminal option1 has no reaction/cannot update. Prior source maps menu1 to install, which checks pinned dependencies, early-returns when its local signature matches and never fetches release source. The old environment-is-latest wording did not establish source version. Lost keystrokes have not been reproduced on native Mac. Corrected start/progress/completion distinguish source from dependencies.

Saved follow mode checks only current upstream-tracking branch (release by default), preserving histories and compatible customer commits. Dirty files, active ports, existing Git operation, conflict/unrelated history or old Git pause with explanation. Git2.38+ merge-tree preflight leaves index/working files untouched. Normal merge disables autostash and ignored-file overwrite; no reset/force checkout/auto rollback/customer push/PR. Local/own/linked/historical source is retained with explicit scope; dependency repair never updates source. These installer semantics do not restrict Agent Full Access. Source changes release the owned installation lock and run fresh Bash/OS bootstrap with one continuation marker, reloading actual settings/dependencies. Credentials/data are excluded from source and unchanged.

## Verification

81 script checks passed,10 environment-specific Windows checks skipped.12 new live-Git source checks cover actual update, compatible divergent history, current/selected versions, local/own preservation, pending/conflicting/ignored customer files, fetch failure and runtime/concurrent-change pause.2 native macOS PTY tests verify menu1 immediate Chinese feedback, first Git prompt input and follow-mode old→new source plus UPDATED_LAUNCHER_LOADED fresh bootstrap, unchanged dependency check and clean install lock. Full menu/installer/storage/curl/Windows routing regressions pass; Bash syntax and git diff --check pass. No UI/backend source changed, so no frontend/model rerun claimed. No actual customer machine, account/API credentials, keychain, provider inference or native Windows self-rebootstrap tested.

## Delivery and limits

Main merge/push after self-check follows standing owner rule04. No release/testcode publication authorized for this new candidate yet. Existing old scripts cannot acquire the updater until source is updated once manually. In saved follow mode stop app, save pending changes, git fetch upstream and git merge upstream/release, review conflicts, then reopen bash Saplingagent.sh. New updater fetches/merges only upon explicit menu1/install, not unattended launch. Local/own customers deliberately choose Git setup→Follow release to opt in; preserve selected version/history. Old Git can use manual reconciliation. Source merge and dependency completion are separate; interrupted/I/O/hook failures require inspecting actual Git/version rather than assumed success. No new package dependency/global change.

Official public references checked2026-10-13: https://git-scm.com/docs/git-merge-tree, https://git-scm.com/docs/git-fetch, https://git-scm.com/docs/git-merge. Internal contract/deployment/limits in scripts/launcher/README.md. Native Windows/hardware and actual customer feedback remain separate acceptance; no human test pass invented.
