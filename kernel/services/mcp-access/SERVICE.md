# External MCP access

Kernel-owned native tools for an external local AI client, TASK-20261021-003.
The client's MCP transport owns this stdio subprocess. It does not require an
application runtime, built-in Codex/Claude/OpenCode account, service-token or
listening port. Model execution remains with the external client. Server metadata
uses the installed kernel/manifest.json version, or unknown when unavailable.

Files: server.mjs supplies the official MCP protocol, rules/Skills and metadata
logging; native.mjs executes file/command operations; the public builtin contract
is kernel/contracts/mcp-access.mjs. Kernel dependencies directly pin official
@modelcontextprotocol/sdk1.32.1, Zod4.6.7 for schemas and YAML2.9.1 for Skill
frontmatter. SDK2.x APIs are not used. Dependencies and Node stay project-local.

The application-owned backend/mcp-runtime remains unchanged. Its16tools include
page snapshots, preferences and recovery; this independent service has8native
tools and does not bridge web conversations or those application HTTP APIs.
Absolute, parent and symlink paths remain available to the current OS user.
Managed configuration/ownership paths are project-relative; this is distinct
from tool permissions. No root elevation, directory allowlist, approval gate,
implicit snapshot, automatic rollback or task-registration claims are added.

Logs: logs/mcp-access/mcp-access-YYYY-MM-DD.log; matching daily logs older than
30days are removed on the first tool call each UTC day. Only time,level,tool,code
are recorded. No arguments, commands, file contents, credentials or output bodies.
Log failure cannot alter a completed operation. Stdout is strictly JSON-RPC;
stderr reports only bounded startup/shutdown codes and generic recovery guidance.

All eight tools check the current enabled setting before executing. Shutdown
stops owned commands, waits for dispatched file operations, then removes only
this subprocess's ownership receipt. Other MCP clients, the AI host, app runtime
and unrelated processes are not stopped. Unknown ownership blocks maintenance
for inspection. OS forced termination and commands intentionally detaching beyond
their owned process group cannot guarantee complete descendant cleanup.

See CONTRACT.md for boundaries and DEPLOY.md for connection, test and recovery.
