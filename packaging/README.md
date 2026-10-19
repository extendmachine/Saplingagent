# macOS source delivery

The source packager is implemented in `kernel/scripts/package-macos.mjs`. It reads a committed Git revision, extracts an explicit allowlist, verifies source blobs, initializes recipient goal/task records and writes a ZIP, a SHA-256 sidecar and per-file `delivery.json` manifest.

Include source, locked dependencies, all rules (including the English controlled attachment), project Skills, HTML guides and LICENSE/NOTICE/THIRD_PARTY_NOTICES. Exclude real credentials, sessions, preferences, logs, snapshots, installed runtimes/dependencies, Git history, worktrees and caches. Existing user business data is not included by default.

Run using the installed project Node: `node kernel/scripts/package-macos.mjs HEAD`, or use the exact project-runtime command in the root README. Output defaults to `.cache/releases/`. Validate the actual ZIP and hashes before sharing; do not zip the running application folder.

The recipient must install and log in independently. ZIP installation does not require Git; repackaging and version controls do. Commercial rights and third-party authentication requirements remain separate. This is a source package, not a signed/notarized native Mac app.

Full application/data backups are a distinct user-requested workflow. No Clawtask business ZIP or remote deployment is produced by this macOS task; rule 17 governs any future Clawtask packaging request.

The package requires exactly one root launcher, Saplingagent.sh. Recipient instructions run it with bash in Terminal and select English or Chinese; the retired .command launchers are excluded. Internal scripts remain part of the complete seed.
