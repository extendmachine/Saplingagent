# Standalone AI configuration service

TASK-20261012-001 / Codex. Responsibilities: project-private provider schemes/keys/ledger, official Codex account flow, explicit model discovery and standalone setup lifecycle. Source server.mjs, store.mjs, auth.mjs, test/. Frontend lives in front/ai-config; shared file/transport contracts in kernel/contracts/ai-configuration.mjs and codex-rpc.mjs. The service does not host chat or change tool/file permissions.

Runtime Node24.21 in project .runtime, native built-ins only; existing pinned Codex0.146.1 used for auth. No npm service dependencies. Launcher builds existing React/Vite configuration entry into kernel/.cache/setup, then starts `node kernel/services/ai-config/server.mjs`; default OS-assigned loopback port. Ctrl+C or Finish setup stops only setup/owned auth. Public contract CONTRACT.md; deployment DEPLOY.md; official evidence REFERENCES.md. Runtime metadata stays in terminal (no credentials or raw upstream errors); this module introduces no persistent logs. Auth/keys/config/ledger under local-secrets/, ignored and excluded from distribution. Existing accounts and schemes are retained; blank keys preserve, explicitly replacing a key updates only that scheme. Anonymous custom local endpoints require noAuth selection.

Claude Agent engine support: see CONTRACT.md and DEPLOY.md for the shared API profile/session binding and local runtime behavior. No changes to the minimal single-chat product scope.

## Explicit local credential import (TASK-20261013-002)

credentials.mjs parses bounded, explicitly selected local/upload documents without executing shell helpers or reading the OS keychain. store.mjs publishes only project-private credentials, schemes and ledger references with its existing exclusive writer. server.mjs coordinates imports with owned OAuth and scheme changes. No new dependency, log or persistent process. Codex imports ChatGPT auth.json; Claude imports API keys only. Full Access is unchanged. See CONTRACT/DEPLOY/REFERENCES for formats, replacement, expiry and provider-policy limits.

0.9.3: also hosts project name/icon/build progress and launcher controls through the public project-launcher contract. Demand-started management survives business restarts and can be reopened from the native bootstrap. It binds an OS-assigned loopback port and verifies root/instance ownership; no global supervisor or new business-service registration. Build and lifecycle logs use logs/project-launcher/,30-day retention. Close setup and Stop app are separate actions.
