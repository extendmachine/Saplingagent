# Project-local launcher and source delivery

`Saplingagent.sh` is the single bilingual user entry on macOS and native Windows (Git Bash). Run `bash Saplingagent.sh` in the complete application folder. Install / update prepares pinned Node/Codex/OpenCode and locked local dependencies; Configure AI opens a standalone React configuration page; Start app supervises owned chat services; Diagnostics checks installation/configuration without inference. See the root README and OS installation guides.

## Configuration boundary

`scripts/launcher/cli.mjs configure [--no-open]` checks installation, initializes project-local runtime metadata without global account import, builds `front/ai-config` with existing frontend dependencies, and launches `backend/ai-config/server.mjs` on an assigned loopback port. Finish setup closes that service and returns to the menu. Windows configure bypasses winpty; browser/device login runs through its owned Codex App Server. Control+C exits the launcher and terminates only owned children. No paid prompt or automatic chat-service restart.

Saved account/API schemes live in local-secrets; shared `contracts/ai-configuration.mjs` adapts them for Agent startup. A selected API or OpenCode scheme does not require ChatGPT login. Legacy explicit `login`, `opencode`, `logout` recovery commands remain. Running sessions are not rebound to changed providers; restart and create a new conversation after configuration changes.

## Runtime and package boundary

The launcher selects the pinned OS runtime within `.runtime/`, npm cache within `.cache/npm/`, and dependencies within each source module. It does not install globally, alter permanent environment settings, elevate permissions or import another project's credentials. Direct development commands in scripts/ remain internal maintenance tools; the supported recipient entry is the root Bash launcher.

`scripts/dev.mjs` owns the runtime-manager, persistent public gateway (5173), internal Vite (5174), Agent (4310), workspace (4311), builder (4312), optional PDF (4313) and OpenCode (4315). Restart app/backends and recovery routes follow backend/runtime-manager/CONTRACT.md; do not kill unrelated services by port or name.

Source packagers export an explicit Git commit into a clean macOS/Windows ZIP with checksummed files, all rules/Skills/source/dependency declarations and fresh recipient records. No private state, installed dependencies, logs, worktrees or developer approvals. They are source deliveries, not offline model bundles or Clawtask imports. See scripts/macos/README.md and scripts/windows/README.md for OS contracts and honest pending native validation.
