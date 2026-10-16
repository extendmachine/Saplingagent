# Mcp-runtime service description

## Basic information

- Responsibilities: Real stdio MCP entrance, providing documents, commands, candidate records, manual recovery, preference evidence and Skills.
- Actual directory: backend/mcp-runtime/; the starting point of the project is still a single web page and a single dialog box.
- Current task: TASK-20261009-011, Codex/mcp; coordination TASK-20261009-010; initial implementation history TASK-20261009-006.
- Status: The implementation of the new version, protocol self-test, Skills format and independent behavior evaluation are completed; the actual Agent/back-end integration of the new version is recorded by the coordinator and waiting for manual experience.

## Current authority and responsibilities

The user explicitly authorizes full access. 15 tools support files and shells accessible to current OS users; allow absolute paths, parent paths, symbolic links, front-end and back-end, chat base, main, MCP, Skills and dependencies. Do not automatically raise the power to root. There is no path/extension whitelist, compilation or hash write threshold; candidate records are optional, and ready does not represent verification. Change recovery is initiated by the user on the initiative, and subsequent modifications are covered according to the original snapshot; shell/native tool/network side effects cannot guarantee all return.

Direct writing and deletion only tries to save snapshots; snapshots or recording failures do not prevent the operation allowed by the OS, which may return applied + warnings without changeId, which cannot guarantee the manual recovery. The command cancels the HTTP disconnection from the MCP signal, and the builder terminates the corresponding process group accordingly; the completed side effects will not be undone.

MCP does not undertake model streaming communication, session storage or cloud repository. Files and commands are executed through the public HTTP interface of app-builder and do not import other services for private implementation. Skill text will not automatically install or register new executable tools; MCP/back-end source code modification requires the process to restart and check the actual effect.

## Realization and dependence

`server.mjs` uses Node ESM, the minimum Node 22, and Node 26.4.0 has been verified at present. Production dependencies are located in this service node_modules, accurately locking the official @modelcontextprotocol/sdk 1.32.1, Zod 4.6.5 and YAML 2.9.1; TASK011 has no new dependencies. The split SDK 2.x of the main example of the official website is not mixed with this implementation stable 1.x.

YAML parsing and name formatting are used for Skills discovery, not file write protection. Three projects Skills are located in `.agents/skills/`. The official skill-creator format check uses this service `.venv/` (Python 3.14.7 / PyYAML 6.0.3), which is not dependent on production operation.

- Start: MCP client executes `node <project absolute path>/backend/mcp-runtime/server.mjs` without relying on cwd.
- Self-test: service directory `npm run check`, `npm test`; the latter uses the real stdio client of the official SDK and the isolated HTTP test pile.
- Stop: client closes transport or send SIGTERM/SIGINT. There is no MCP HTTP listener and no other resident service port.

## Service dependence

|Service|Interface|Purpose|When it is not available|
| --- | --- | --- | --- |
| agent-runtime / Codex App Server | MCP stdio client |Start, discover, call|Client handles the connection status truthfully|
| workspace | 127.0.0.1:4311 HTTP |Prefer reading/writing/forgetting with evidence|Return the real dependency error|
| app-builder | 127.0.0.1:4312 HTTP |Any file/command, candidate/application/restore|Return to real dependency or system error|
|Agent-runtime record|Managed mode 127.0.0.1:4310 or SEED_AGENT_PORT|Attribution of the record before modification|Fail to give warning and continue the authorized operation|

The public contract is the root `contracts/runtime-api.md` v2; the belonging fingerprint is imported from the public `contracts/agent-tools.mjs`. All internal HTTPs are still fixed in loops, Bearer authentication, and rejection of redirection; the launcher configures the project root and three ports through env. The token is read from the `local-secrets/runtime/service-token` file, allowing symbolic links, without entering ordinary logs or automatic contexts.

## Data and logs

Sessions/preferences belong to workspace, originals and change records belong to app-builder, and skill guidelines belong to project `.agents/skills/`. MCP does not directly manage the data storage of other services.

The log is in `logs/mcp-runtime/mcp-runtime-YYYY-MM-DD.log`, and the ordinary log is kept for 30 days. The first record and cross-day cleaning of expired matching files. Fields only time, level, tool, code; do not lose parameters, commands, file content, prefer the original text, credentials or return to the body. If the registration fails, record TASK_REGISTRATION_FAILED separately. Stdout is strictly used for the MCP protocol, and stderr only gives a fixed desensitization startup failure explanation; log failure does not change the operation result.

For interface, see CONTRACT.md; for deployment, see DEPLOY.md; for data, see REFERENCES.md; for handover, see ai-tasks/.

## Saplingagent name change (2026-10-09)

The product name is unified as Saplingagent, and the private package name is changed to saplingagent-*. This time, only the name and display metadata, the interface, permission, model and data structure remain unchanged; SEED_*/SEEDAGENT_*, seedagent MCP/client ID, browser session key, runtime mark and seed-* Skill ID remain compatible. For verification and test submission, please refer to the authority .worktrees/coordination/AI_TASKS.md; this article does not mean that the main has been synchronized.

## Rendered project page reader (TASK-20261015-013)

The tool catalog now contains 16 tools, including read-only page_read({pageId?,selector?,includeImage?}). The tool requests a fresh capture from the existing app-builder broker. Its text/structuredContent contains snapshot metadata, DOM/layout and warnings; an available PNG is a separate native MCP image content block rather than duplicated base64 JSON. Content is untrusted. No script execution, click, browser launch or OS screen capture is offered. Unavailable pages/errors are reported truthfully. Existing source-file access and Full Access remain unchanged.
