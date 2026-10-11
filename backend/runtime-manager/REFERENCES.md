# Runtime manager sources

Implementation uses the project's installed Node 24.21.0 built-in HTTP, child_process, filesystem, crypto, net and AbortSignal APIs; no third-party service/API or model changes.

- https://nodejs.org/docs/latest-v24.x/api/child_process.html — child ownership, detached process groups and exit events.
- https://nodejs.org/docs/latest-v24.x/api/http.html — local HTTP server lifecycle.
- https://nodejs.org/docs/latest-v24.x/api/globals.html — fetch/AbortSignal lifecycle deadlines.

Executable behavior is checked through real isolated Node child processes and local HTTP tests. Documentation URLs are provided for reference; this task does not claim new external API verification. No authentication or external account is required for the manager itself; Codex uses the existing project's own login.
