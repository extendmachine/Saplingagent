# AI project entry point

@rules/README.md

Before development, modification, commits, tests, deployment or documentation work, read `rules/README.md` in full and follow its task routing.

Before the first substantive modification, provide the rules-reading receipt defined there. Before every final conversational reply, including ordinary chat and read-only review, and before committing, provide its eight-field completion-review receipt. Receipts report results; they do not request approval. Read-only tasks stay unregistered; minimum registration and missing-file initialization follow `rules/README.md`.

Also read:

1. `FINAL_GOAL.md`
2. `TODO.md`
3. `AI_TASKS.md`
4. Task-related Markdown in the relevant service directory.

For parallel tasks, locate the authoritative index under rule 14. A worktree snapshot is not a live ownership record. `rules/README.md` is the single source of public control rules; do not duplicate the full rules here.

## Project-specific notes

Maintain only concise project guidance here. Do not remove the import, required reading or public-rule priority. Put detailed requirements in `rules/` and progress in `TODO.md`/`AI_TASKS.md`.

- Project name: Saplingagent. Local Agent, workspace, app-builder, MCP and Skills are implemented. The starting point is a single chat page; current Git controls and any user-requested features are retained. Check goal/status files for actual validation and limits.
- New persistent project processes must participate in Restart app: use conventional backend discovery or config/services.json, including dependencies and readiness. See backend/runtime-manager/CONTRACT.md and docs/project-services.html; the AI creating the feature completes this integration.
- Source directories: frontend `front/`, backend services `backend/`, human HTML documentation `docs/`. `services/` is an index only; public-rule service path examples map to actual backend directories.
- Full Access is the user's explicit decision: frontend/chat/main/backend/MCP/Skills/dependencies/configuration may be edited as the current OS user, with no MCP directory allowlist or mandatory compilation/per-operation confirmation. This does not elevate to root. Restore only on explicit user request; see `backend/app-builder/`.
- Runtime task registration is nonblocking and records actual modifications, without copying conversation text. Runtime records do not establish human acceptance, Git approval or publication completion. Earlier protected-directory policies in historical TASK005–009 were superseded by TASK010–013.
- Keep only `main`, `adobe-replica` and `release` as named branches. Since 2026-10-15, main is the owner’s development/testing branch; release is the public default/distribution and showcase branch. Shared changes land on main before a requested release promotion; presentation media stays only on release. Preserve branch-specific content and older history; see rule04. Local `.worktrees/coordination/` is detached and remains the authoritative development index when present. Do not create a competing index. Sequential candidate work can remain detached to honor the three-branch constraint, with independent service commits and the owner-authorized main workflow in rule04.
- Repository/install documentation and UI are English. Preserve protocol IDs, actual filesystem paths and existing user conversation data. Project-owned source uses PolyForm Noncommercial 1.0.0; separate commercial permission does not grant third-party authentication rights.

- Customer Git storage: installer asks three choices: local reset (erase root Git metadata, initialize empty main with zero commits/no remotes, preserve application files), own existing remote (add/update origin), or upstream release. Own mode retains an existing selected version unless a branch is explicitly configured. Local choice prints the reset notice and requires an explicit selection; reinstall retains saved choices and later history. Read local git config saplingagent.storageMode when relevant. Save version stays local; storage setup does not authorize hosted repository creation, pushes or PRs. Follow the customer's explicit publication instructions. Release is the distribution default, not a cosmetic rename of maintainer main.

- Maintainer owner instruction (2026-10-12): after appropriate self-checks, synchronize authorized work directly to main and push without another confirmation. See rule04 for scope. Report actual verification and do not invent human acceptance. This standing authorization belongs to the original maintainer repository and does not transfer to recipient projects. Follow the main-first and release-only showcase policy in rule04. An explicit main-only request leaves release untouched; other branches synchronize only within the requested scope.

- The independent kernel covers install/update, Git management, complete restart, AI connection/configuration and engine adapters; read kernel/CONTRACT.md and kernel/DEPLOY.md. Chat UI, workspace/context, page builder/read, MCP and all default/custom Skills/plugin registrations are application-owned and freely editable, including mixed application entries/styles/build/dependency files. Kernel updates/restores do not own those paths. Full Access is unchanged. Never regenerate a recipient baseline to hide local core edits; maintainer-owned core changes regenerate/check the manifest before publication. Schema2 replaces the unreleased broad prototype and rejects obsolete automatic update/recovery plans.

- Before publication, verify the exact code/main SHA, then the declared product version, release SHA/tag and downloaded package metadata. Follow contracts/release.md and scripts/verify-release.mjs; use the owner-selected product version without inventing an increment. Preserve public tags by default; explicit owner correction of a mistaken label requires old-target/publication evidence and expected-old-value checks. Product release identity is distinct from independent kernel and customer Git versions.
