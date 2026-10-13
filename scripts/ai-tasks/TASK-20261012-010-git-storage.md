# TASK-20261012-010: Project launcher, packaging, Git storage and documentation

- Executor/coordinator: Codex/root.
- Source: detached .worktrees/git-storage; baseline main185aa5ef2abaa1c30ad32a34a841e0f8647293ec.
- Authority: .worktrees/coordination/AI_TASKS.md and TODO.md (historical rule snapshot there does not replace current root rules2026-10-11.1).
- Status: implementation/self-check complete, pending exact-version human acceptance; no main merge/push or release source synchronization.

## Behavior

Customer distributions default release, with explicit override and existing version configuration preserved. First install asks local Git / own existing remote / author upstream release; existing repositories can keep their configuration. The single bilingual Bash entry exposes menu5/git for later setup. No automatic hosted repository creation, push, pull or PR; Full Access remains unchanged. Application version APIs use the actual application Git root, rejecting parent-repository inheritance.

## Validation and limits

73 targeted tests pass;4 native Windows condition tests skipped. Includes native Git, isolated remotes, failed-fetch retry, raw ZIP provenance, explicit branch, independent repositories, existing/dirty source, parent-root prevention, managed-remote reconfiguration, secret exclusion, real macOS PTY foreground bridge/input and HTTP Git routes. Mac/Windows source ZIP scaffolds exported default release despite checked-out main; all manifest hashes/rules verified, each extracted folder initialized a real release and preserved repeat-install configuration. A real new-folder Mac installation selected local in Chinese and installed pinned dependencies successfully; its Node runtime was copied locally with symlinks preserved rather than redownloaded. Final frozen package evidence and human results belong to authority, not backfilled here. No actual Windows10 OS/browser/install, real customer remote authentication, model prompt, PR or push test. No frontend source/protocol field change; existing branch display reads real Git state.

## Human review

Extract the final candidate ZIP, run bash Saplingagent.sh, choose Install / update and select storage. Verify local mode gives release/no remote; own mode only configures your URL and publishes nothing; follow mode requires upstream access and fetches without replacing files. Menu5 allows explicit reconfiguration. Repeat installation preserves a deliberately selected branch/version; dirty source is not discarded. Main/release synchronization requires exact-version human confirmation under rules04/09; testcode stays untouched.
