# Official sources

Checked2026-10-21 for TASK-20261021-003. Public references need no account.

- Model Context Protocol transport specification:
  https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
  — inspected official stdio subprocess ownership, newline JSON-RPC and protocol-only
  stdout requirements. This service adds no HTTP transport or remote listener.
- Official TypeScript SDK repository:
  https://github.com/modelcontextprotocol/typescript-sdk
  — implementation is pinned to @modelcontextprotocol/sdk1.32.1 from the project's
  exact lock, using its server/mcp, server/stdio and client/stdio interfaces. Installed
  v1.32.1 source was inspected for cancellation and10MiB default frame buffering.
  Direct web retrieval of the v1.x branch was unavailable during this check; no claim
  of reading that page. SDK2 examples were not used.
- Node.js child processes:
  https://nodejs.org/docs/latest-v24.x/api/child_process.html
  — Node24 child process pipes and ownership. Native commands use the existing
  public kernel/contracts/local-process.mjs platform contract; this work does not
  infer Windows hardware acceptance from the POSIX checks.
  Direct web retrieval was unavailable during final verification; this URL is a
  reference, not a claim of having read that page. Installed Node behavior was
  checked through isolated native process tests.

No provider login, API key, OAuth copy or third-party account permission is required
by this server. The external AI client's own account and model policies still apply.
