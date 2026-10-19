# Git storage and source delivery references

Checked 2026-10-12 for TASK-20261012-010 (Codex). Official pages accessed; no login required to read. Runtime compatibility: Git with init -b/switch (2.28+) on supported macOS / Git for Windows.

| Source | Official URL | Purpose | Authentication |
| --- | --- | --- | --- |
| Git init | https://git-scm.com/docs/git-init | Explicit initial branch and project-local Git metadata | None |
| Git remote | https://git-scm.com/docs/git-remote | Customer origin / author upstream configuration | Host credentials when contacting private remotes |
| Git fetch | https://git-scm.com/docs/git-fetch | Fetch source history without checkout/push | Repository access as required |
| GitHub default branch | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/changing-the-default-branch | Default customer source/clone branch | GitHub repository admin for mutation |

Do not embed tokens/passwords in remote URLs. Local configuration is not publication authorization. Installation never creates a hosted repository/PR or pushes. No credential added by this task.
