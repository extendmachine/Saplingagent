# Runtime manager sources

Implementation uses the project's installed Node 24.21.0 built-in HTTP, child_process, filesystem, crypto, net and AbortSignal APIs; no third-party service/API or model changes.

- https://nodejs.org/docs/latest-v24.x/api/child_process.html — child ownership, detached process groups and exit events.
- https://nodejs.org/docs/latest-v24.x/api/http.html — local HTTP server lifecycle.
- https://nodejs.org/docs/latest-v24.x/api/globals.html — fetch/AbortSignal lifecycle deadlines.

Executable behavior is checked through real isolated Node child processes and local HTTP tests. Documentation URLs are provided for reference; this task does not claim new external API verification. No authentication or external account is required for the manager itself; Codex uses the existing project's own login.

## Windows implementation sources (checked 2026-10-11)

- Node24.21 child_process: https://nodejs.org/download/release/v24.21.0/docs/api/child_process.html — Windows .cmd limitations, signal behavior and owned process lifecycle. Public; project Node24.21.0.
- Microsoft taskkill: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill — /PID /T /F termination of an owned live process tree. Public; Windows10/11 x64; current-user OS rights.
- OpenAI Windows: https://learn.chatgpt.com/docs/windows/windows-sandbox — native PowerShell, Windows11 recommendation and recent Windows10 best effort. Public; this project still pins Codex0.146.1 and retains Full Access. Real account required for inference; no sandbox migration is inferred from newer docs.
- Exact npm metadata https://registry.npmjs.org/@openai/codex/0.146.1 and https://registry.npmjs.org/opencode-ai/1.19.0 — native Windows optional dependencies; local OpenCode postinstall selects executable. Public, downloads/install required; no model request.

## Ascending port allocation (TASK-20261014-002)

https://nodejs.org/docs/latest-v24.x/api/net.html — official Node24 LTS net.Server listen/error/address/close behavior, checked2026-10-14 via the official24.x documentation navigation (current page24.22.0; project executable remains24.21.0). Public, no account required. Actual project Node24.21.0 port contention, retries and shutdown are verified by isolated tests. No SDK/runtime upgrade.
