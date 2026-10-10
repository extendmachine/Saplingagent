# Workspace service description

- Contents: backend/workspace/, TASK-20261009-007, Codex/workspace.
- Status: Implementation and isolation self-examination are completed, and the real joint adjustment is summarized by TASK-005; non-Git, no branch or submission.
- Responsibilities: local session, Codex threadId, message, running status, request to reweight the ledger and long-term preferences with clear evidence. Used by agent/MCP through internal HTTP.
- It is not responsible for model calls, code generation, execution tools or cloud sharing, and does not automatically take temporary requirements as preferences.

## Structure and operation

server.mjs loopback HTTP; store.mjs verification/serialization/atomic writing; test/isolation test; package.json service script, no third-party running dependency.
Node >=22, has been checked in the existing Node 26.4.0 of the project. Npm start or node backend/workspace/server.mjs; default 127.0.0.1:4311, SEED_WORKSPACE_PORT can be overwritten. SEED_ROOT can specify the seed root directory, which is derived from the module location by default, and there is no absolute path for the development machine.
Health check GET /health. Stop the terminal Ctrl+C; the unified process is managed by the root launcher.

## Data and interface boundary

data/workspace/sessions/<uuid>.json, data/workspace/preferences.json, directory 700, JSON600; single-process global queue serialization modification, temporary file fsync with the same directory rename. expectedRevision can be transmitted to prevent expiration coverage; multi-process co-writing is not supported. Directory and file reject symbolic links.
The model continuation chat can only be read and written through the contract, and it is forbidden to import other services for private implementation. The session business data is saved in the application directory, and the secret value only reads local-secrets/runtime/service-token. The service will not output the token/request body.

## Daily record

logs/workspace/workspace-YYYY-MM-DD.log, info/warn/error, field requestId/code; start and cross-day clean up the ordinary log 30 days ago, do not enter Git. The log does not record messages, preferences, request bodies or credentials.

Contract CONTRACT.md; Start/Restore DEPLOY.md; Source REFERENCES.md; Handover ai-tasks/TASK-20261009-007.md.

## Saplingagent name change (2026-10-09)

The product name is unified as Saplingagent, and the private package name is changed to saplingagent-*. This time, only the name and display metadata, the interface, permission, model and data structure remain unchanged; SEED_*/SEEDAGENT_*, seedagent MCP/client ID, browser session key, runtime mark and seed-* Skill ID remain compatible. For verification and test submission, please refer to the authority .worktrees/coordination/AI_TASKS.md; this article does not mean that the main has been synchronized.
