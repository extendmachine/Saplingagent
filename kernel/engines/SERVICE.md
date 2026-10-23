# Agent engine adapters

These modules run inside the application Agent and translate its existing provider
contract to pinned Codex, OpenCode and Claude clients. They have no independent HTTP
listener. `providers/claude.mjs` uses the official project-local Claude Agent SDK
0.3.296 and its unmodified Claude Code 2.1.296 binary. No dependency upgrade is
needed for the owner's local subscription-token option (TASK-20261022-004).

Start, interrupt and close are invoked by the Agent provider host. Native children
belong to that provider and participate in its close/restart lifecycle. Full Access,
existing sessions, attachment input, MCP and Skills remain unchanged. The shared
`kernel/contracts/ai-configuration.mjs` supplies private typed profiles; the setup
service owns saving and changing them. This adapter never logs in, imports accounts,
stores a token, modifies global configuration or sends an automatic model prompt.

Claude SDK stderr is drained without being copied to logs. Adapter errors redact
the configured credential values before reaching the host; raw causes and custom
error properties are not forwarded. Host operational logs remain in
`logs/agent-runtime/` with its existing daily, 30-day policy.

See CONTRACT.md, DEPLOY.md and REFERENCES.md for interfaces, verification limits,
authentication conditions and source links. Codex relocation remains in README.md.
