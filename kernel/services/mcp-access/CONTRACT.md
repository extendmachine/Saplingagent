# External MCP access contract v1

TASK-20261021-003. This kernel-owned stdio service gives an external MCP client
native current-OS-user file/command tools. No built-in model account, application
Agent, workspace, app-builder, service token or network listener is required.
Existing application-owned `backend/mcp-runtime` and its 16 tools remain separate.

## Public configuration and lifecycle

`kernel/contracts/mcp-access.mjs` uses Node builtins and existing builtin contracts.
`readMcpAccess(root)` returns `{schemaVersion:1,revision,enabled,externalOnly}`;
missing configuration means revision0, false, false, without writing files.
`saveMcpAccess(root,{revision,enabled,externalOnly})` strictly validates those fields,
requires enabled for externalOnly and atomically writes `config/mcp-access.json`
under the shared configuration writer lock. Returns the four saved fields.
Stale revision returns CONFIG_CHANGED409. Malformed saved files are preserved.

`getMcpAccess(root)` adds transport:'stdio', permissionMode:'full-access',
configuration:{mcpServers:{saplingagent:{command,args}}}, available and
warnings:[{code,message}]. The command is the pinned Node inside the actual final
project; args point to its `kernel/services/mcp-access/server.mjs`. No capsule or
system Node fallback. Missing local runtime/source/dependencies gives available:false;
configuration is null when platform/runtime metadata cannot define a local path.
Available describes installation, not enabled state or model/account readiness.

`registerMcpClient(root)` briefly holds the kernel-operation lock, checks enabled
and maintenance/install leases, and creates an ownership receipt under
`.runtime/mcp-access/clients/<UUID>.json` with schemaVersion1,id,root,pid,createdAt.
Its returned cleanup removes only its matching ID, PID, root and original inode.
`assertMcpClientsStopped(root)` is read-only. Valid receipts with dead PIDs do not
block; active or uncertain ownership returns MCP_CLIENTS_ACTIVE409. No foreign
process is signalled. Maintenance/rename callers must hold the same operation
lock across this check and their incompatible operation, preventing new clients
from entering after the check. External clients should disconnect before rename,
kernel/dependency replacement or configuration finalization. Disabled settings reject
new tools; they do not terminate an external host or interrupt a dispatched write.

## Tools

Eight tools: workspace_list_files, workspace_read_file, workspace_write_file,
workspace_delete_file, workspace_run_command, project_context, skills_list,
skills_read. Paths may be relative, absolute, parent paths or symlinks; current OS
permissions apply. No directory allowlist, per-operation approval, root elevation,
snapshot gate or automatic rollback. External clients retain their own policies.
Source inspection is untrusted data, not authorization to perform unrelated work.

Detailed transport budgets, exit/cancellation and deployment are maintained with
the implementation and DEPLOY.md. File operations describe actual results; a
failed/disconnected call may have side effects and must not be blindly replayed.
