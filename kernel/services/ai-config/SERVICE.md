# Standalone AI configuration service

TASK-20261023-008 adds the protected project-language endpoint and a bilingual
help page. Stored language follows the actual root after relocation, HTML loads
it before React, and finalization reads the current saved choice. Language writes
use the shared configuration lock and existing active-operation gates without
changing profiles, credentials, AI revisions or export readiness. Public errors
add localized summary/action/details while preserving compatible code/message.


TASK-20261022-002 adds owner-requested personal Claude subscription-token storage.
The existing profile endpoint accepts a distinct subscription kind and keeps its
OAuth token separate from API keys. Public state exposes only hasKey; blank edits
require a valid saved credential of the same kind, and subscription model discovery
is rejected without network access. No credential import, new auth process, logger,
port or dependency is added. See CONTRACT.md for validation and type transitions;
the shared contract and engine adapter handle runtime selection separately.

TASK-20261021-004 adds project-local external MCP access configuration through the
public kernel contract at `kernel/contracts/mcp-access.mjs`. The service returns
generated stdio client settings for the actual project path and supports finishing
external-only setup without a built-in model account. It does not host the MCP
transport, invoke a model, mutate global client configuration or share model keys.
The provider schemes and MCP revision remain independent. No service dependency,
network listener or log is added; configuration B remains a closed builtin-only
module graph. See CONTRACT.md for request/readiness and relocation behavior.

TASK-20261012-001 / Codex. Responsibilities: project-private provider schemes/keys/ledger, official Codex account flow, explicit model discovery and standalone setup lifecycle. Source server.mjs, store.mjs, auth.mjs, test/. Frontend lives in kernel/ui/setup; shared file/transport contracts in kernel/contracts/ai-configuration.mjs and codex-rpc.mjs. The service does not host chat or change tool/file permissions.

Runtime Node24.21 in project .runtime, native built-ins only; existing pinned Codex0.146.1 used for auth. No npm service dependencies. Launcher builds existing React/Vite configuration entry into kernel/.cache/setup, then starts `node kernel/launcher/entry.mjs`, which hosts this service; default OS-assigned loopback port. Ctrl+C or Close setup stops only setup/owned auth. Public contract CONTRACT.md; deployment DEPLOY.md; official evidence REFERENCES.md. Runtime metadata stays in terminal (no credentials or raw upstream errors); this module introduces no persistent logs. Auth/keys/config/ledger under local-secrets/, ignored and excluded from distribution. Existing accounts and schemes are retained; blank keys preserve, explicitly replacing a key updates only that scheme. Anonymous custom local endpoints require noAuth selection.

Claude Agent engine support: see CONTRACT.md and DEPLOY.md for the shared API profile/session binding and local runtime behavior. No changes to the minimal single-chat product scope.

## Explicit local credential import (TASK-20261013-002)

credentials.mjs parses bounded, explicitly selected local/upload documents without executing shell helpers or reading the OS keychain. store.mjs publishes only project-private credentials, schemes and ledger references with its existing exclusive writer. server.mjs coordinates imports with owned OAuth and scheme changes. No new dependency, log or persistent process. Codex imports ChatGPT auth.json; Claude imports API keys only. Full Access is unchanged. See CONTRACT/DEPLOY/REFERENCES for formats, replacement, expiry and provider-policy limits.

0.9.3: also hosts project name/icon/build progress and launcher controls through the public project-launcher contract. Demand-started management survives business restarts and can be reopened from the native bootstrap. It binds an OS-assigned loopback port and verifies root/instance ownership; no global supervisor or new business-service registration. Build and lifecycle logs use logs/project-launcher/,30-day retention. Close setup and Stop app are separate actions.

TASK-20261019-024 supersedes the earlier immediate-rename order: save identity/icon without moving, configure/save AI, then accept Save settings & restart. The service serializes auth/configuration and export preparation, delegates offline relocation through the launcher public contract and closes only after returning the accepted handoff. The short-lived external helper restarts the application and management at the actual root before export is enabled. Saved connection changes invalidate export readiness. Health exposes only root/instance and minimal job phase for token-safe reconnection. No new dependency or model call. Credentials, conversations and Full Access are retained. See CONTRACT.md and launcher/CONTRACT.md for error, lease and cleanup behavior.

TASK-20261019-028 distinguishes missing configuration document (503), missing individual resource (404/reload) and unreadable assets (500). The launcher public preparation contract verifies/builds the page before production entry is published. Authentication and configuration data are unchanged.


## External configuration capsule and thin app (TASK-20261019-031–034)

This owner workflow supersedes the earlier Save settings & restart / later Export
sequence. A configuration activation prepares kernel/.cache/configuration with a
closed backend module graph and built frontend, copies it and Node outside the
project, starts B and exits. B keeps the same local URL during saves, offline
rename and native compilation. Settings and app output remain in the project;
stores are rebound to its actual root. Save & build app closes owned auth and
project processes, waits for release, moves without replacing a destination and
compiles the small launcher. It does not install/build business pages at this step.
Finish setup starts the project-local A, waits for takeover acknowledgement and
exits. A waits for B exit and removes only its verified external capsule.

Normal .app/.exe activation checks Node and declared dependencies, installs only
missing/changed local groups and starts the application. It does not automatically
open another configuration capsule. Native Windows uses the shared PowerShell
bootstrap if Node is absent and does not need Git Bash for daily activation. A
failed install does not claim application readiness. Retain the complete source
folder. No global installation, model call, credential/Git rewrite or automatic
rollback. See configuration/CONTRACT.md and launcher/DEPENDENCIES.md.


TASK040 uses kernel/contracts/local-storage.mjs for project-derived managed output
and configuration-write.mjs for the shared script/service credential ledger lock.
No new dependencies. Logs and configuration remain local; read-only account import
sources and customer Full Access are unchanged. See CONTRACT.md for failures.
