# Connect an external local AI

Install/repair the project with Saplingagent.sh, open configuration and enable
External AI / MCP. Copy the generated configuration into a client that supports
local MCP stdio. The command is this project's pinned Node executable and its
args contain kernel/services/mcp-access/server.mjs. It is independent of cwd and
uses no network endpoint or built-in model credential. Do not launch it as an
interactive terminal menu or add shell wrappers that print into stdout.

Settings: config/mcp-access.json, optimistic revision and shared configuration
writer lock. Local process receipts: .runtime/mcp-access/clients/. A disabled
project refuses new connections and subsequent tool operations; already dispatched
work is allowed to finish. Disabling does not close the external AI application.
External-only selection is consumed by platform setup/runtime; it is not an AI
model provider. Connecting MCP neither invokes a model nor starts other projects.

Full Access means the current OS user's accessible files and commands, including
absolute/parent/symlink paths. The client can impose its own approvals. Native
write/delete returns applied without a recovery snapshot; back up important work
or use the client's versioning. Completed shell/network effects are not undone.

Disconnect this project's MCP entry in every external client before project
rename, kernel/dependency replacement or configuration finalization. Leave other projects
running. Maintenance never kills the external client. If a crash leaves receipts,
inspect their recorded project and PID; valid confirmed-dead receipts are ignored,
unknown/live ownership blocks maintenance. Do not delete receipts for live clients.
After a folder rename, copy the newly generated configuration; old absolute paths
cannot follow the new folder automatically. Ordinary app backend/frontend restart
does not affect this independent MCP subprocess.

Transport budgets: JSON-RPC input64MiB; content16Mi characters; read max4MiB with
offset/hashScope metadata; list1–2000entries; context/Skill128KiB per file and
200Skill directory entries. A duplicated encoded result is capped at8MiB; large
read/list results request smaller pagination. Command output retains at most1MiB
per stream and may be shortened further when JSON escaping exceeds8MiB. Truncation
flags and actual exitCode/signal are preserved. Command timeout defaults60seconds,
accepts1–3600000ms; configure the external client's tool timeout to at least3615s
when running hour-long commands. These are transport/operation budgets, not an
entire conversation deadline or path permission boundary. Cancellation terminates
the owned command group/tree and cannot undo effects already completed.

Verification with project Node:

```sh
node --test kernel/services/mcp-access/test/*.test.mjs
```

Tests use real SDK stdio in isolated project-local fixtures with no models, accounts
or existing customer services. Windows-specific shell/process behavior uses the
existing kernel OS contract; native Windows client/command acceptance is separate.
Protocol tests with POSIX shell syntax are macOS/Linux-only until a Windows test
fixture is provided. Do not claim native Windows acceptance from macOS results.

Source recovery: explicitly restore a known kernel backup with clients disconnected,
then repair kernel dependencies and reconnect. Do not modify recipient baselines,
application MCP, conversations or credentials to repair this service.
