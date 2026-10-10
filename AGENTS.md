# AI project entry point

@rules/README.md

Before development, modification, commits, tests, deployment or documentation work, read `rules/README.md` in full and follow its task routing.

Before the first substantive modification, provide the rules-reading receipt defined there. Before finishing or committing, provide its completion-review receipt. Receipts report results; they do not request approval. Read-only tasks, minimum registration and missing-file initialization follow `rules/README.md`.

Also read:

1. `FINAL_GOAL.md`
2. `TODO.md`
3. `AI_TASKS.md`
4. Task-related Markdown in the relevant service directory.

For parallel tasks, locate the authoritative index under rule 14. A worktree snapshot is not a live ownership record. `rules/README.md` is the single source of public control rules; do not duplicate the full rules here.

## Project-specific notes

Maintain only concise project guidance here. Do not remove the import, required reading or public-rule priority. Put detailed requirements in `rules/` and progress in `TODO.md`/`AI_TASKS.md`.

- Project name: Saplingagent. Local Agent, workspace, app-builder, MCP and Skills are implemented. The starting point is a single chat page; current Git controls and any user-requested features are retained. Check goal/status files for actual validation and limits.
- Source directories: frontend `front/`, backend services `backend/`, human HTML documentation `docs/`. `services/` is an index only; public-rule service path examples map to actual backend directories.
- Full Access is the user's explicit decision: frontend/chat/main/backend/MCP/Skills/dependencies/configuration may be edited as the current OS user, with no MCP directory allowlist or mandatory compilation/per-operation confirmation. This does not elevate to root. Restore only on explicit user request; see `backend/app-builder/`.
- Runtime task registration is nonblocking and records actual modifications, without copying conversation text. Runtime records do not establish human acceptance, Git approval or publication completion. Earlier protected-directory policies in historical TASK005–009 were superseded by TASK010–013.
- Keep only `main`, `testcode` and `release` as named branches. Since 2026-10-10, main is the shared baseline and the other two may be explicitly synchronized to the same reviewed code; preserve older history. Local `.worktrees/coordination/` is detached and remains the authoritative development index when present. Do not create a competing index. Sequential candidate work can remain detached to honor the three-branch constraint, with independent service commits and exact-version human approval.
- Repository/install documentation and UI are English. Preserve protocol IDs, actual filesystem paths and existing user conversation data. Project-owned source uses PolyForm Noncommercial 1.0.0; separate commercial permission does not grant third-party authentication rights.
