# Workspace local run and recovery

Environment Node >=22; no npm depends on the installation steps. The root directory of the application must exist, and the launcher first creates a local token file (permission 600), and the service does not generate or display its value.
From the root node backend/workspace/server.mjs, or this directory npm start; SEED_ROOT can switch independent seed directories, SEED_WORKSPACE_PORT defaults to 4311. Binding fixed 127.0.0.1, Ctrl+C/terminate the unified launcher to stop. Npm test self-built temporary application root in the service directory, end removal, do not pollute the real session.

Check GET http://127.0.0.1:4311/health; business requests are only sent by internal agent/MCP through Bearer. Confirm the session refresh recovery, continuation and preference evidence, and the manual results are recorded by the root TODO.
Restore data: stop service, complete backup data/workspace/; JSON schema current v1, no automatic migration. Damaged JSON clearly reports CORRUPT_STORAGE, which cannot be overwritten with empty data; restore the last trusted backup before starting. Snapshot/code rollback should not be brought back messages or preferences. Only a single process is supported to write to the same storage.
The log is automatically kept for 30 days and belongs to the project logs/workspace/, and the real running log is not saved in the service code directory; all credentials are kept local-secrets, and packaging must be excluded.
No external release, Git/main synchronization or human acceptance record. For official information, please refer to REFERENCES.md.

## Managed restart
The project runtime manager prepares this service using the internal contract before terminating its owned process group. Finish AI/file/Git work before Restart app or Restart backend; busy work refuses restart without interruption. Prepared services reject new mutations until release or replacement. The launcher keeps its gateway/control alive. See ../runtime-manager/CONTRACT.md and DEPLOY.md.

## Claude Agent delivery

Install/update using the same project-local Bash launcher. Agent dependencies pin official Claude Agent SDK0.3.296, including optional native macOS/Windows x64/arm64 binaries; do not omit optional packages. The installer verifies the native binary without a model prompt. No separate global Claude Code installation, new public port or global account import is required. Configure AI in the independent page, choose Claude Agent / Anthropic Messages, save an API key/model/custom API base URL, finish, restart and begin a new conversation. Startup control initialization and MCP/Skills checks do not establish provider quota.

Keys use local-secrets/api-keys/ai-<id>.json and the shared credential ledger. SDK settings/transcripts use local-secrets/claude/. CLAUDE.md imports AGENTS.md; existing .agents/skills loads through .agents/.claude-plugin/plugin.json. Full Access remains bypassPermissions with sandbox disabled. Native dialogs are not advertised/rendered; ordinary chat questions are used. Stopping/restarting terminates only owned process trees before releasing a running session. Windows10 actual SDK/model/browser acceptance is pending.

Rollback: preserve local-secrets and data, select the previous reviewed Git version, install its lockfiles and restart. Older versions cannot parse Claude profiles; before switching back, select a compatible default in the current setup page, back up connections.json, then deliberately remove only Claude profiles from that metadata file before starting the older version. Do not overwrite or delete credentials or transcripts automatically. Recheck health and an existing conversation after rollback.

## Attachment data and recovery

Back up data/attachments together with data/sessions. Keep both ignored and private to this local project; no new port, dependency or credentials. Removing an item from the composer removes its message selection, not stored bytes. Unsent uploads remain local; there is no automatic attachment cleanup or delete endpoint. Preserve original files for retained conversation IDs. Existing sessions without attachment metadata remain compatible. Older clients may ignore new attachment fields; preserve backups before using an older writer. An interrupted upload can leave an unreferenced binary; report the actual storage error and retry with a new ID, never overwrite another upload.
