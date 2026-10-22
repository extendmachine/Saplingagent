# TASK-20261021-005 — Built-in provider wording clarification

Codex/status_audit,2026-10-21; rules2026-10-15.1. Root authorized this follow-up
after read-only integration review. It follows frozen UI8c9c0bb; that historical
handoff remains unchanged. The API/runtime definition of externalOnly permits
setup/startup without model authentication, but does not disable an existing
configured provider. Corrected the two bilingual UI messages and README to say
that MCP itself supplies no model for web chat and existing providers remain usable.
This supersedes the earlier handoff's statement that web chat has no model in this
mode. No runtime, API, permission, settings or path-export behavior changed.

All17UI/flow tests, TypeScript and production setup build passed again; evidence
is .cache/mcp-ui-wording-tests.log and .cache/mcp-ui-wording-build.log. Diff/scope
checks passed. Root owns the integrated browser review and final main workflow;
no customer/global file, main/release/tag or model was touched. Cherry-pick this
small follow-up after8c9c0bb. Coordinator records its actual frozen SHA separately.
