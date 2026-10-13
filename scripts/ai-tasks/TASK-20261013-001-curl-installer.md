# TASK-20261013-001 Release bootstrap

- Executor/coordinator Codex/root;2026-10-13.
- Source detached .worktrees/curl-installer from main60f09c340f1f40af582d505354023dd9c492664b. Authority .worktrees/coordination/AI_TASKS.md and TODO.md.
- Status implementation/self-check complete. Exact frozen source/main/release commits and published checks recorded in authority afterward.

## Scope and decisions

User requests one-command curl download/install from release, without exposing author main/testcode refs in the normal customer workflow. Project-level install.sh, scripts/launcher/{git-storage,recipient-records,cli}.mjs, source packager, isolated scripts tests, goal and installation guides. No Agent/frontend permissions, dependencies, credential/model calls, global environment, existing customer files or testcode changes. All work stays in project/contained worktrees.

Standalone Bash3.2 script resolves GitHub release SHA, downloads a commit archive (no Git refs/history), validates prefix/path/file types and complete bootstrap files, stages safely and refuses existing destinations. --dir/--lang/--download-only supported. HTTPS/failure/timeout/retry controls; own staging cleanup preserves failure status. Interactive install and menu read /dev/tty through fd3 in foreground so the downloaded script stream cannot consume prompts. Windows continues through existing Git Bash/native bridge/device detection. Unsupported Linux/WSL and noninteractive install get clear guidance. Shared recipient-records initializes unmodified goal/task/AGENTS once before first Git setup; changed docs or Git are preserved with warning. Source packager reuses the same records instead of a second template.

Follow mode narrows remote.upstream.fetch to selected release branch and --no-tags; future ordinary fetch cannot import author main/testcode by default. Explicit branch configurations and existing refs retained. Local empty main is independent customer history. Public branches remain manually accessible; no path/tool/permission restrictions. Existing Git local/own/follow and app menu remain. Source updates are deliberate; bootstrap is new-install only.

## Verification and limits

67 script tests passed,10 environment-conditional tests skipped on Mac. New bootstrap cases: fixed release download/Unicode paths, destination preservation, corrupt/link archive rejection and failure status, Windows uname selection, unsupported OS/ref rejection, no-TTY recovery, recipient init/reinstall/pre-install edits, actual PTY piped script reads install input and opens menu. Actual Git fixture has release/main/testcode/tag: first/future fetches keep only release (optional upstream/HEAD alias correctly points release). Existing macOS CLI, Git, shell/menu/process tests pass. Fixture list updated for shared helper. Initial Bash3.2 unbraced variable before Unicode ellipsis and EXIT failure-status defect found/fixed by tests; source syntax/test fixture escaping corrected; no customer data affected. No backend/frontend build needed. ZIP/live download and published native installer results added to authority after freezing.

Native Windows10/real provider/account acceptance pending; simulated Windows selector and Mac PTY do not establish Windows validation. No real credentials, model request or production restart. Root original3 dirty files/foreign authority prefixes retained. User standing instruction permits direct main self-checked publication; this release-only public installer request authorizes delivering the bootstrap on release as well. No hosted Release/tag or testcode sync.

## Official sources and follow-up

Checked2026-10-13: https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives, https://docs.github.com/en/rest/git/refs#get-a-reference, https://git-scm.com/docs/git-remote, https://curl.se/docs/manpage.html. Public source download needs no credentials; GitHub API rate limits/network errors can require retry.

Freeze this project commit, verify package bytes/manifest and all rules/helpers, normally merge/push main and release with prior histories preserved, then check real public raw script/download in an independent project-contained folder. Keep source frozen and write actual results only in authority. Customer entry bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/extendmachine/Saplingagent/release/install.sh | bash'. After install configure own AI and start; Windows uses Git Bash.
