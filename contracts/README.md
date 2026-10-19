# Share the public contract

runtime-api.md is the local HTTP/SSE field index, and each service CONTRACT is the detailed authority. agent-tools.mjs only shares the tool parameter normalization/fingerprint protocol, which is used to match the current request with Agent before the MCP change, and does not include the private implementation or real credentials of business services. The front-end HTTP type is in front/chat/runtime-api.ts; the official MCP input schema is registered by the service SDK.

The current contract v2 is Full Access, and there is no directory/compulsory verification threshold; see runtime-api.md for general files and command interfaces.

## Persistent runtime control
`scripts/dev.mjs` now supervises frontend and backends using backend/runtime-manager. Public frontPort is a persistent same-origin gateway; internal Vite uses vitePort (default5174). Restart app reloads selected source; Restart backend preserves frontend. Optional services are discovered from the selected checkout. Recovery route `/__saplingagent/runtime` stays available during failure; manager/launcher/port changes require the operating-system launcher. See kernel/services/runtime-manager/CONTRACT.md and DEPLOY.md.

## OS process contract (TASK028)

local-process.mjs is shared, stateless OS plumbing, not another service's private implementation. It resolves pinned native Windows Codex/OpenCode executables and Node's npm JS entry; never executes a .cmd shim or adds shell interpolation to API arguments. commandShell uses ComSpec on Windows even when a Git Bash SHELL is inherited. terminateOwned accepts a caller-owned ChildProcess: POSIX detached group TERM/KILL, or Windows taskkill /PID /T /F while that child is still alive. It does not discover PIDs by name/port or target an already-exited child. Windows termination is abrupt; saved state is retained, active command side effects cannot be undone, and externally detached descendants/forced parent death are outside guaranteed cleanup. Full Access and HTTP/SSE schemas remain unchanged.

## AI configuration and Codex transport (TASK-20261012-001)

`ai-configuration.mjs` reads schema-v1 project-private account/API schemes, derives the default engine/model and maps private keys to Codex environment or native OpenCode provider configuration. It validates metadata and never writes public credentials. `codex-rpc.mjs` is shared newline-delimited JSON-RPC stdio transport, including owned-process cleanup; agent-runtime/rpc.mjs remains a compatibility export. Setup and Agent communicate through these public contracts, not private service imports. See kernel/services/ai-config/CONTRACT.md.

TASK-20261014-002/003/004: runtime status adds actual ports; the runtime-manager CONTRACT defines .runtime/runtime-address.json discovery and effective SEED_*_PORT values including SEED_FRONT_PORT. Starting values remain in config/runtime.json; unified launch selects available ascending ports without source changes.
