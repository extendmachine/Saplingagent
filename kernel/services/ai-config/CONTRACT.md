# AI configuration contract v1.1

## Personal Claude subscription token (TASK-20261022-002)

`POST /api/config/profiles` additionally accepts a Claude-only
`kind:'subscription'` scheme: `{revision?,id?,label,engine:'claude',kind,model,apiKey?,activate?}`.
The existing write-only `apiKey` input carries the token manually obtained with
`claude setup-token`; it is not an API key in this mode. Public and persisted
profile metadata contain only `{id,label,engine,kind,model}`, with `hasKey` added
to public summaries. Private storage uses `{oauthToken}` at the existing
`local-secrets/api-keys/ai-<id>.json`, referenced in the ledger as `oauth-token`
for personal local use. No subscription token is imported from local account
stores, copied into a capsule, returned in HTTP, logged or added to public config.

New schemes and authentication-kind changes require a nonblank token. An omitted
or blank token retains credentials only for the same existing Claude subscription
scheme when its saved credential passes the shared contract's validation. Missing,
malformed or API-key-only credentials return400 `KEY_REQUIRED` for re-entry;
invalid engine, any supplied `noAuth`/`baseUrl`/`protocol`/`contextWindow`/`maxOutput`, invalid model or token
returns400 `INVALID_CONFIG`. Token input is limited to8192 characters, rejects
control characters and internal whitespace, and trims surrounding spaces.
`POST /api/config/models` rejects subscription discovery before any fetch; enter
a model ID manually. Errors never include the supplied token or raw credential.

Existing revision, writer-lock, Host/Origin/token, request-size, pending-login/import
and setup-readiness behavior is unchanged. API profiles and credential imports
remain separate; changing back to API authentication requires its own key unless
the API endpoint explicitly uses noAuth. Changing authentication kind deliberately
replaces that scheme's private credential type, not another scheme. Saving confirms
local storage only, not remote login, entitlement, token expiry or model access.
This owner-requested personal setup does not establish approval to offer Claude
subscription authentication in a third-party distributed product.

## External MCP access (TASK-20261021-004)

`GET /api/config/mcp` returns the public kernel MCP-access state:
`{schemaVersion:1,revision,enabled,externalOnly,transport:'stdio',permissionMode:'full-access',configuration,available,warnings}`.
`configuration` is a generated `mcpServers.saplingagent` client entry with the
current project's local Node command and kernel entry arguments. It contains no
provider credentials, setup token or permanent external path setting. Read it
again after a project rename/build before copying it into an external client.
`configuration` is null when the local runtime path cannot be determined;
`available:false` and `warnings:[{code,message}]` report missing local prerequisites.
These fields do not claim a successful external-client connection.

`POST /api/config/mcp` accepts exactly `{revision,enabled,externalOnly}` and returns
the same complete state. The booleans are explicit; externalOnly requires enabled.
The revision belongs to MCP settings, independently of provider profiles. The
kernel MCP-access public contract atomically persists `config/mcp-access.json`
under the shared configuration writer lease. Stale revisions return409
`CONFIG_CHANGED`; invalid input400 `INVALID_CONFIG`. Successful saves invalidate
the prior setup/export receipt. An I/O failure can follow persistence; reload the
actual state instead of assuming rollback.

Both endpoints retain Host/Origin/Fetch Metadata and `X-Sapling-Config` checks.
Writes require saved project settings, use the64KiB JSON limit and count as active
configuration requests so directory changes, build and close cannot race them.
Pending login/import and active project operations refuse MCP changes. No model
request, global client-config write, HTTP MCP listener or new credential is added.

`GET /api/config/state` and provider/import mutation replies additionally contain
`mcp:{revision,enabled,externalOnly,available}`. Saving/activating a provider does
not change MCP access. Finalize/build accepts either an active provider profile
or enabled externalOnly MCP access; this never fabricates a model profile. Setup
fingerprints include MCP configuration bytes when present; existing receipts keep
their original hash when the MCP file is absent. Enabling, disabling or editing
MCP configuration therefore requires another completed setup/build.

The configuration service imports the Node-builtin-only shared contract at
`kernel/contracts/mcp-access.mjs`; the protocol server and SDK are not included in
configuration B's module closure. Provider setup remains available while MCP is
enabled, and provider mutations do not select or disable external-only mode.

TASK-20261012-001, Codex. The standalone setup service binds 127.0.0.1 at an OS-assigned port; it serves the compiled kernel/ui/setup entry independently of chat. No persistent supervisor slot. Same-origin requests with X-Sapling-Config token from the HTML meta tag; reject other Host, Origin and cross-site Fetch Metadata. Token only protects setup HTTP and does not change Agent Full Access.

- GET /api/config/state: {revision,activeId,profiles,codex,login,mcp}. Profile summaries contain hasKey, never key material, credentials, email or arbitrary headers. MCP summary fields are defined above.
- POST /api/config/profiles: {revision?,id?,label,engine:codex|opencode|claude,kind:api|chatgpt|subscription,model?,apiKey?,activate?}; API schemes also use {protocol:responses|chat|anthropic,baseUrl,noAuth?,contextWindow?,maxOutput?}. The subscription shape and credential rules are defined above. Blank API keys retain a saved API key; noAuth disables it for that edited API profile while retaining the old private key. ChatGPT profile needs locally saved ChatGPT credentials. Creates/updates one scheme; no model request. Returns sanitized state. Version mismatch 409 CONFIG_CHANGED; invalid input 400 INVALID_CONFIG. Configuration is stored in local-secrets/ai-config/connections.json; API keys and subscription tokens are local-secrets/api-keys/ai-<id>.json and referenced in the ledger. No key in public runtime config/TOML/CLI argv.
- POST /api/config/activate {revision?,id}: select an existing saved scheme; no current service restart/session mutation. New runtime/new conversation uses it.
- POST /api/config/models: profile draft fields above, saved id and optional apiKey. Explicit, bounded GET of <baseUrl>/models with matching auth. No prompt; no persistence. {models:[{id,name}]}; HTTP failure 502 PROVIDER_HTTP_ERROR with status, no raw body/key; timeout/transport 502 PROVIDER_UNREACHABLE; redirects not followed. IDs manual when endpoint lacks discovery.
- POST /api/config/login {mode:chatgpt|chatgptDeviceCode}: official pinned local Codex App Server auth flow, no password proxy. Returns {login:{phase,authUrl?,userCode?,mode}}; completion is polled through state. Login completion saves/selects ChatGPT scheme and registers credential reference. Only one login at a time (409 LOGIN_BUSY). App-server callbacks with another loginId are ignored. Late callbacks after cancellation/close do not activate a scheme.
- POST /api/config/login/cancel: cancel only the owned current auth flow.
- POST /api/config/close: close only setup service and its owned auth process, returning to launcher; running chat services stay as they are.

All responses no-store. JSON only, bounded body64KiB. Static assets served from explicitly built configuration UI, never arbitrary root files. Errors use {error:{code,message}} without raw upstream data. Disk/schema/lock errors are explicit; malformed files are preserved. Serial writes use an exclusive project-local writer lock, individually atomic key/ledger/profile publication (an I/O failure requires reloading actual state; this is not a cross-file transaction), stale locks are not silently broken. Saving is not quota/network/model/tool validation. Runtime kernel/contracts/ai-configuration.mjs translate private schemes to Codex args/env, OpenCode native provider config or Claude Agent SDK env/options, retaining existing manual configuration and permissions. No dependency upgrades.

## Explicit credential import (2026-10-13 / TASK-20261013-002)

POST `/api/config/credentials/import`: `{engine:codex|claude,source:local|upload,revision,replace?:boolean,json?:string,profile?:object}`. Same loopback/token/origin protection as other writes. Required revision and exclusive configuration writer lock; refused during owned OAuth or another import (`LOGIN_BUSY`/`IMPORT_BUSY`). Returns sanitized state including login, never source file content or keys. No inference, external authentication check, global write or shell/keychain/helper execution.

- Codex local: read only `<CODEX_HOME or user-home/.codex>/auth.json`, on explicit click. Upload: JSON text from a selected file. Maximum decoded credential document 32KiB, plain object with nonempty token strings `tokens.id_token`, `tokens.access_token`, `tokens.refresh_token`; optional account_id/auth_mode/last_refresh retained, unrelated fields dropped. API-key-only files are rejected; use API configuration instead. Publish to project `local-secrets/codex/auth.json`, register credential reference, select codex-account. Existing destination (including malformed files) requires replace:true; no automatic backup or silent overwrite. Source stays unchanged. File/keychain-only fallback failures are actionable, not reported as successful login.
- Claude local API: read inherited `ANTHROPIC_API_KEY`, optional ANTHROPIC_BASE_URL/ANTHROPIC_MODEL; otherwise read only `<CLAUDE_CONFIG_DIR or user-home/.claude>/settings.json` and extract env.ANTHROPIC_API_KEY/ANTHROPIC_BASE_URL/ANTHROPIC_MODEL plus top-level model. No `.credentials.json`, keychain, OAuth token or apiKeyHelper execution. Upload: accept `apiKey`, `ANTHROPIC_API_KEY` or `env.ANTHROPIC_API_KEY` with optional baseUrl/model (or equivalent env fields). Reject subscription OAuth documents. profile supplies id/label/baseUrl/model/token limits; explicit nonblank form fields override document hints. Create/select a Claude/Anthropic Messages scheme via existing profile validation, keeping custom provider URL. Existing selected API key requires replace:true. Never put credential values in state/TOML/argv/ledger. API documents may be named auth.json, but Claude Code subscription credential files are not API key documents.

Errors: 400 INVALID_CREDENTIALS/UNSUPPORTED_AUTH/CREDENTIALS_TOO_LARGE/INVALID_CONFIG/KEY_REQUIRED; 404 LOCAL_AUTH_NOT_FOUND/LOCAL_API_NOT_FOUND; 409 CREDENTIAL_EXISTS/CONFIG_CHANGED/CONFIG_BUSY/LOGIN_BUSY/IMPORT_BUSY; 500 LOCAL_AUTH_UNREADABLE/CONFIG_STORAGE_ERROR. Missing local files and unsupported keychain/desktop/subscription auth lead to official Codex login or Claude API setup. Imports share the existing individually atomic credential/ledger/profile writes, not a cross-file transaction; after I/O failure inspect actual state. Successful import confirms local storage only; expiry, model access, quota, network and Windows-native acceptance remain separate.

## Claude Agent engine (TASK-20261012-005–009)

Engine ID `claude` uses the project-local official Claude Agent SDK with Anthropic Messages API profiles or the personal subscription-token scheme defined above. Each conversation binds `engine`, `providerId` (`sapling-<profile-id>`) and `modelId`; existing bindings are immutable. API configuration accepts custom HTTP(S) base URLs ending in `/v1`; SDK transport removes this trailing API version before its own `/v1/messages` route. Subscription mode has no custom endpoint. Credentials remain in local-secrets, never public responses. The default takes effect after restart. Local initialization checks MCP and Skills without a model prompt; configured authentication is not proven quota. Streaming, completion, interruption and failure use existing chat events. Missing native sessions are reported, never silently replaced. Full Access and the completion-review receipt remain unchanged. The personal token is entered manually; there is no new subscription browser-login or automatic account-import flow.

## Product0.9.3 project setup

The same standalone service hosts project identity, PNG icon, local build progress and runtime actions through /api/config/project. Delegation uses the public kernel/launcher/public.mjs interface; see kernel/launcher/CONTRACT.md. Builds return202 and progress is polled; refreshing the browser does not resend a build. Project image requests have a bounded2MiB JSON limit; credential endpoints retain64KiB. All mutations retain same-origin/token validation. Offline finalization restarts controllers at the actual root; no browser-supplied arbitrary shell commands. Closing setup during a build returns409; explicit Stop app is distinct from closing the page. Native launch mode starts/reuses the app while retaining management independently of business restarts.

## Save settings, offline finalization and export (TASK-20261019-024)

This owner-requested flow supersedes TASK019's immediate directory rename. `POST /api/config/project/save` takes `{name,folderName,iconData?,renameFolder:boolean}` and saves desired identity/icon and a root-bound settings receipt without moving the folder. The compatibility `/project/prepare` route performs the same save-only operation. Maintainer worktrees retain their actual folder (`renameFolder:false`). The old immediate `/project/rename` route returns409 `PROJECT_FINALIZATION_REQUIRED`; no HTTP route moves the directory inside the live management process.

`GET /api/config/project` adds `settingsSaved`, `exportReady` and `finalization:{id?,phase,message?,error?}`. AI configuration requires saved settings (`PROJECT_SETTINGS_REQUIRED`409); export requires a verified restart (`PROJECT_RESTART_REQUIRED`409). Profile/activation/import/login mutations invalidate export readiness before any possible credential write, including partial failures and asynchronous login completion. Model discovery is read-only and does not invalidate readiness. Credentials remain in the project, never in the temporary helper plan or a browser redirect.

`POST /api/config/project/finalize` accepts only `{}`. After settings and a selected AI scheme (or enabled external-only MCP access) exist, it waits for owned auth to close and delegates to `ProjectLauncher.finalizeSetup` with the actual server PID, instance ID and bound loopback port. The launcher stops only verified owned idle runtime services and stages a short-lived external system helper. A busy application, pending OAuth/import, concurrent configuration request, install/update or another finalization returns409 without a directory move. The response is202 `{finalization:{id,phase,targetRoot,previousRoot,managementPort,readyUrl}}`; then the old management process closes. There is no client-supplied PID, arbitrary command or executable path.

The helper waits for the old process to release project-local Node/log handles, moves the folder, resumes at the actual root and starts the application plus management. It attempts to reuse the management port. The old page polls unauthenticated `GET /health/project-launcher` for a matching finalization ID with phase `ready` or `failed`, then reloads to acquire the new per-process token. Health exposes root, instance ID, busy and sanitized finalization status only. New management opens its page as a recovery route when old-page reconnection fails. A failed move keeps the source directory; a later failure retains the actual current root, failed receipt and explicit retry instructions, with no automatic rollback.

Save → wait for verified restart → export App. Export never renames; when necessary it stops the verified idle runtime for compilation and starts it again. Closing the configuration page alone does not save unsaved inputs, request finalization or export. The directory-operation latch and active AI-request counter serialize staging against account/provider writes and closure. Full Access, existing credentials, native session recovery, application source/data and customer Git remain unchanged. See the launcher contract for temporary directory ownership/cleanup and process readiness; Windows native behavior needs its own acceptance.

## Unified kernel version (2026-10-19)

There is one current Saplingagent version: kernel0.9.6. kernel/manifest.json is authoritative. UI, setup, Bash, packages and upgrade targets use that installed value, never a separate product number. config/release.json and JSON releaseVersion/productVersion fields are deprecated compatibility mirrors/aliases, not independent identities; source packaging verifies agreement. Kernel-only maintenance changes the displayed kernel version without touching business configuration. Missing/invalid installed metadata is unavailable in UI, not a claimed baseline. Git revisions remain source identifiers.

New comparison normalizes only historical labels0.90→0.9.0,0.91→0.9.2,0.92→0.9.3; original manifests/backups stay byte-exact. Shipped old comparators cannot understand0.9.4. Stop the app, download new tooling into an isolated .cache subfolder, then run that tooling's kernel/cli.mjs --root ORIGINAL_APP check/update with the project-local Node. Default is preview; update requires existing explicit risk acknowledgement and refuses conflicts/live targets. Never overwrite/rebaseline local core edits or regenerate a customer manifest to hide them. Source recovery remains explicit.


## Static configuration errors (TASK-20261019-028)

Management entry and direct service execution prepare and verify the configuration document/assets before listening. The test/embedding factory still accepts explicit assets without starting build tools. GET / returns UI_NOT_BUILT/503 only when index.html is absent. An absent allowed /assets/<name> returns UI_ASSET_NOT_FOUND/404 with reload/configure guidance, not a claim that the entire page is unbuilt. Other filesystem read failures return UI_UNREADABLE/500 with local-file recovery guidance. Responses remain no-store with existing security headers. No new authenticated API or credential operation.


## External configuration host (TASK-20261019-034)

Production Configure AI now runs from an independent copied capsule. GET project
adds configurationHost:'external'. Save/prepare still save settings without moving.
POST project/finalize {} returns202 {job} (kind configure), remains on the same
server/token and polls GET project through rename and native launcher compilation.
The server closes owned login and rebinds stores/credential imports to the actual
root after relocation; assets stay in the external capsule. No model request.
POST project/build is the same saved-settings rebuild operation for this host.
POST close acknowledges cleanup A before returning {closed:true,handoff:true}; B
then exits, and A waits before deleting the owned capsule. If takeover fails, the
page remains available with CONFIGURATION_RETURN_FAILED. Same-origin/token gates
remain. Legacy injected controllers retain the original handoff response for
compatibility, but all production configuration entries route to external B.

External configuration rejects project/open and project/restart with CONFIGURATION_FINISH_REQUIRED. Finish setup before opening the app so its dependency checks run. Project stop remains available. A failed cleanup handoff permits retry and never reports closed=true.


## Project-relative configuration writes (TASK-20261019-040)

Credential/profile/ledger writes and script setup share one ownership-tagged
`local-secrets/ai-config/write.lock`. Its file handle closes before the protected
work; the matching writer removes only its own receipt on completion. Existing
unknown/stale locks produce CONFIG_BUSY for inspection, never deletion by PID
guess. Ledger publication is an atomic same-directory replacement so reopening
the script cannot overwrite an in-flight profile update. Managed storage rejects
symlinked ancestors before creating child directories (PROJECT_STORAGE_LOCATION).
These checks constrain the configuration service's own destinations, not Agent tools.
Official login children use project-local temp/cache/XDG defaults and CODEX_HOME.
Explicit local account imports still read the selected original source without
changing it. Directory rename waits for active AI requests and owned auth exit.

## Shared interface language (TASK-20261023-008)

Protected `GET /api/config/language` returns `{language:'en'|'zh',supported:['en','zh']}`.
Protected `POST /api/config/language` accepts exactly `{language:'en'|'zh'}` and
returns the same shape. Existing Host/Origin/Fetch Metadata, token and JSON-body
limits apply. Language can be chosen before project or account setup; the write
counts as an active configuration request and refuses directory/finalization
operations. It does not change account profiles, credentials, AI revisions,
model requests or setup/export readiness. Unsupported values/extra fields return
400 `INVALID_LANGUAGE`. Persistence uses the shared project-relative
`config/ui-language.json` contract and follows the current root after relocation.

The HTML language comes from saved project preferences, falling back to an explicit
launcher language or browser Accept-Language and then English. Finalization reads
the stored language again. The UI uses the central setup-message catalog and
shared human error explanations; stable codes and sanitized original details
remain available in an expandable disclosure. Switching language preserves drafts,
secrets in unsaved form inputs and operation state. A delayed initial preference
read must not overwrite a newer explicit selection. Saved content, user paths,
provider/model identifiers and protocol values are never translated.


Language-only writes use the shared configuration writer lease and managed-path
checks, without updating the credential ledger. Errors retain the existing
`{error:{code,message}}` fields and add `{summary,action,details}` from the shared
language contract; unknown internal exceptions are sanitized before explanation.
`GET /help?lang=en|zh` renders shared bilingual guidance with this setup server's
language endpoint/token. Its sole inline helper receives a per-response CSP nonce.

HTML navigation to `/` that explicitly accepts `text/html` receives a small,
asset-independent localized error page when setup UI files/build or local
configuration storage prevent rendering. It preserves the failure status and
existing security headers, escapes all text, and provides a reload link, Help
link and collapsed code/original-details disclosure. It runs no script, repair,
build or external request. API routes, asset requests and non-HTML clients retain
the JSON error contract. `text/html;q=0` does not request the fallback page.
