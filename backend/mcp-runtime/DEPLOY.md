# Mcp-runtime local run and manual recovery

## Environment and start-up

- Node 22+, currently verified Node 26.4.0; this service `npm ci --ignore-scripts` installation lock depends on local node_modules.
- MCP client command: `node <project absolute path>/backend/mcp-runtime/server.mjs`. Client has a stdio subprocess and no additional HTTP listener.
- Downstream default workspace 127.0.0.1:4311, app-builder:4312; internal token reads from local-secrets/runtime/service-token, does not put args/env, does not output real values. Symbol links are allowed.
- Launcher can configure SEEDAGENT_PROJECT_ROOT, SEEDAGENT_WORKSPACE_PORT, SEEDAGENT_BUILDER_PORT; managed uses SEED_AGENT_MANAGED=1, SEED_AGENT_PORT (default 4310). The internal host is fixed and looped, and there is still Bearer certification.
- The user authorizes Full Access; the coordinator configures Codex danger-full-access, approve never, seedagent MCP default_tools_approval_mode approve, and enables the native file/shell. The permission is for the current OS user, and the root is not automatically raised.
- mcp_servers.seedagent.tool_timeout_sec is set by the coordinator to 3615 to cover the one-hour command; MCP signal cancels HTTP disconnection, and the downstream terminates the corresponding process group; Agent turn still has its own timeout and stop mechanism.

## Start check and verification

1. Service directory `npm run check`, `npm test`; confirm that the lock file is consistent with the actual dependency. TASK011 No new dependencies.
2. Unify the start of the entrance to run downstream, client initialize and tools/list to check 15 tools; skills_list/read check three projects Skill.
3. The SDK test starts the real stdio server in the isolation fixture of this service .test-data; the HTTP pile only verifies the mapping, schemas, errors and records failure to continue the operation, and does not pretend to be a real builder or Agent integration.
4. The actual writing, command, application/manual recovery and model call of the new version are recorded separately by the coordinator; the confirmation/protection test of the old controlled version is history and cannot be regarded as the current Full Access result. Waiting for the user's manual experience.

The protocol test covers all calls of 15 tools, arbitrary path, paging/Base64, legal Skill symlink, the difference between empty directory and bad Skill, ready without compilation, direct write and deletion/command, real error transmission, authentication reading and log desensitization. Managed ordinary read-only without registration, successful context returns ID, eight modifications call back first; after registering reject/invalid ID, still request downstream and give warning. When the snapshot fails, the applied has no changeId, and the two types of warnings coexist and are correctly retained; the real SDK cancellation will disconnect the downstream HTTP.

Three Skills use the official skill-creator quick_validate.py verification; independent read-only behavior assessment confirms that the discussion plan does not write or remember preferences, and the authorization reuse process can be directly saved and scripts/MCP can be added according to actual needs, without requiring validated or confirmation one after another, and not fictitious root/registration/rollback ability.

## Stop, update and restore

Client closes transport or send SIGTERM/SIGINT. After modifying the server/dependence/configuration, restart the relevant client/service, and then check the tools/list with the real call to take effect; text writing or source code saving is not equal to the loading capacity.

Try to save the originals and records of the files written and deleted; SNAPSHOT_UNAVAILABLE/RECORD_UNAVAILABLE may be applied without changeId, indicating that the actual success but no confirmed recovery record. When the user actively requests, page_changes checks the recorded changes and page_rollback restores. Recovery will override subsequent modifications, no hash protection, and will not automatically revert. There may be no snapshots for the side effects of native file tools, shells, networks, service status and business data, and the overall cancellation cannot be guaranteed. Check the actual status first if the writing timeout or disconnects.

There is no database migration for this service. If you need to manually restore the MCP source code, restore the same set of server/package/lock from the explicit backup selected by the user and self-check; currently non-Git, no known stable submission/main merge/release. True secrets, dependencies, .venv, temporary test fixtures and logs are not distributed source code. See REFERENCES.md for information.

TASK015 macOS source package is installed and started through the single Saplingagent.sh menu; the official CLI is provided by project .runtime/codex, and MCP is automatically loaded by Agent. The user logs in by himself and does not distribute developer authentication. For details, please refer to.../../Docs/macos-install.html and../../kernel/scripts/macos/README.md. Complete rules and Skills are included in the package as they are, and the running data is not included in the package.

## page_read readiness

Restart the Agent/MCP after source changes, then open or reload the project UI. Its bridge must be connected; collapse does not disconnect it. page_read waits up to 20 seconds inside the builder, within the35-second transport budget; cancellation propagates. No extra desktop permissions or browser dependency. DOM images may differ from browser pixels or be unavailable; use returned warnings and DOM/layout rather than declaring success from a stale capture. Explicitly request includeImage:false for text/layout only.
