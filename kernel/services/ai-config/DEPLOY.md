# Setup service deployment

## Personal Claude subscription token (2026-10-22)

For the owner's local setup, run the official `claude setup-token` command yourself,
then enter its output in the subscription-token option and choose a Claude model.
Saving does not perform login or inference, and the application does not read your
global Claude account storage. This mode has no custom endpoint or model catalog.
Save & build app, finish setup, then restart and use a new conversation to select
the scheme. API schemes and their explicit credential-import actions remain separate.

Leave the token blank only when editing the same subscription scheme with a valid
saved token. A missing/corrupt token or changing authentication kind requires a new
credential. To preserve another credential, create a separate scheme. Metadata and
the private `{oauthToken}` file remain project-local and excluded from delivery;
the ledger records its purpose without a token or an inferred expiry date. Saved
state is not proof of account entitlement, available quota or successful inference.
Source rollback requires a compatible API/account profile and deliberate removal
of subscription metadata before using an older version that cannot parse it;
preserve the original credentials and conversations. This main-only change is for
the requested personal use, not a new public authentication or hosted offering.

External AI / MCP (TASK-20261021-004): after saving the project settings, enable
MCP access and explicitly select external-only mode when no built-in AI account
is needed. Save & build app can then finish without a provider profile. Existing
profiles remain available and unchanged. Obtain the generated client configuration
after the build/folder rename; a saved export from the old path must be regenerated.
Copying that configuration does not write the external client's global settings.
The standalone kernel MCP process uses stdio; configuration B's temporary HTTP
URL is not an MCP endpoint. Read availability warnings and repair local kernel
dependencies when required. A saved scheme is not a connection acceptance test.

MCP setting edits invalidate setup/export readiness and need another completed
build. Project maintenance/rename refuses live or unverifiable MCP client owners;
disconnect this project's MCP in the external client first, without terminating
the external AI host. There are no new model credentials or private tokens to
export. Source rollback must preserve config/mcp-access.json and customer data;
older sources may not understand external-only mode.

Installed complete folder, Mac Terminal or Windows Git Bash. Run bash Saplingagent.sh; Configure AI builds kernel/ui/setup using the project-local Vite and opens the configuration URL. Main chat need not be started or authenticated. `configure --no-open` prints the URL for manual opening. The script may exit after opening setup; continue in the browser. Browser reload works on the same running service; reopen launcher after stopping it.

Choose ChatGPT browser/device login or save a custom Codex Responses/OpenCode Chat Completions/Responses/Anthropic scheme. Use provider API Base URL, model ID and your own API key; a marketing website is not an API endpoint. Save & use selects the default. Model discovery only runs on button press and never generates a prompt. Then save settings and wait for restart before exporting the app. Restart an existing app and start a new conversation to apply a newly selected scheme; old sessions stay bound to their engine. Do not reuse a saved Codex thread with a different configured provider.

Save name/folder/icon first without moving the directory, then save/select your AI scheme. Complete all edits and choose **Save settings & restart**. The short-lived helper in a private external OS temporary directory waits for owned management/runtime shutdown, moves the independent folder, restarts preparation and services from the actual root and verifies readiness before cleaning up its files. Wait for the restarted configuration page before choosing **Export app**. Export does not rename. Never replace an existing destination; maintainer worktrees stay in place. A failure retains the actual current folder, saved settings and project-local receipt for correction and retry; no automatic rollback or transcript/credential replacement. Close setup is a separate action and does not save unsaved inputs. App readiness is distinct from remote account/quota validation.

Credentials are local-secrets/ files; global accounts/config remain unchanged. Codex auth and Claude API keys are imported only after an explicit configuration-page action. A saved configuration is not a successful remote/model test. Actual login/Windows/provider tool streaming remain human acceptance. Roll back source through Git without deleting local-secrets/ or conversations; return to old-compatible saved scheme before running older sources. Stale writer lock local-secrets/ai-config/write.lock may only be removed after confirming no setup process is running. Preserve malformed files and repair them explicitly. Configuration is demand-started. The explicit Save settings & restart operation restarts only this verified owned application.

## Claude Agent delivery

Install/update using the same project-local Bash launcher. Agent dependencies pin official Claude Agent SDK0.3.296, including optional native macOS/Windows x64/arm64 binaries; do not omit optional packages. The installer verifies the native binary without a model prompt. No separate global Claude Code installation, new public port or global account import is required. Configure AI in the independent page, choose Claude Agent / Anthropic Messages, save an API key/model/custom API base URL, finish, restart and begin a new conversation. Startup control initialization and MCP/Skills checks do not establish provider quota.

Keys use local-secrets/api-keys/ai-<id>.json and the shared credential ledger. SDK settings/transcripts use local-secrets/claude/. CLAUDE.md imports AGENTS.md; existing .agents/skills loads through .agents/.claude-plugin/plugin.json. Full Access remains bypassPermissions with sandbox disabled. Native dialogs are not advertised/rendered; ordinary chat questions are used. Stopping/restarting terminates only owned process trees before releasing a running session. Windows10 actual SDK/model/browser acceptance is pending.

Rollback: preserve local-secrets and data, select the previous reviewed Git version, install its lockfiles and restart. Older versions cannot parse Claude profiles; before switching back, select a compatible default in the current setup page, back up connections.json, then deliberately remove only Claude profiles from that metadata file before starting the older version. Do not overwrite or delete credentials or transcripts automatically. Recheck health and an existing conversation after rollback.

## Reuse existing credentials

In ChatGPT account choose Use local Codex login or Upload auth.json. The local action checks the launcher's original CODEX_HOME, otherwise the current user's .codex directory (macOS home / Windows USERPROFILE). It reads only auth.json; missing/keychain-only credentials require official sign-in or file upload. Imported tokens stay at local-secrets/codex/auth.json; this selects the saved account but does not validate expiry/quota. To replace an existing account, explicitly select Replace existing credentials. No global account is changed. Credential imports are unavailable while owned OAuth is running.

In Claude API fill the provider URL and model, then Import local Claude API credentials or Upload API credential JSON. Local sources are inherited ANTHROPIC_API_KEY and optional ANTHROPIC_BASE_URL/ANTHROPIC_MODEL, otherwise user settings.json under CLAUDE_CONFIG_DIR or .claude. Only API fields are copied; settings hooks, apiKeyHelper, keychain and subscription .credentials.json are not used. Upload accepts {"apiKey":"YOUR_API_KEY","baseUrl":"https://api.anthropic.com/v1","model":"YOUR_MODEL_ID"}, equivalent ANTHROPIC_API_KEY or env.ANTHROPIC_API_KEY fields. JSON may omit URL/model when the form supplies them; explicit form values win. Existing scheme key replacement needs its checkbox; create a new scheme to preserve another key. The normal manual API form remains available.

Files are limited to32KiB (request64KiB), processed by the local setup service and never returned to the browser, stored in browser storage or sent to a model. Malformed/unsupported/oversized files fail explicitly. All imported secrets stay ignored under local-secrets/ with restrictive POSIX permissions; Windows uses current user OS access controls. Source files remain untouched. Configuration writes are individually atomic, not a multi-file transaction: after an I/O failure refresh/check local state. Save settings, wait for the verified restart, then export the app. Begin a fresh conversation when changing providers; historical conversation bindings are retained. Subscription documents are still not accepted by API import; the personal manual-token scheme is described above. Third-party product authentication rights are separate from this local configuration change. Real account/provider and native Windows tests remain recipient acceptance.


Configuration UI recovery: Configure AI, the native launcher and offline restart verify/build the setup page automatically using project-local dependencies. Rebuilds use staging and retain the old page until a complete replacement is ready; old hashed resources remain available to already-open documents. A missing resource requests a page reload. If automatic preparation reports UI_BUILD_FAILED, run `bash Saplingagent.sh install --repair`, then `bash Saplingagent.sh configure`. UI_BUILD_INTERRUPTED requires inspecting the stopped builder before removing only kernel/.cache/setup-build.lock. Do not remove credentials or conversations to repair page assets.


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


## Project language (TASK-20261023-008)

Setup reads `config/ui-language.json` through the shared language contract. A new
folder uses explicit launcher language or browser language with English fallback;
an existing saved preference wins. The setup selector and Help selector save
through the same loopback/token-protected endpoint. No AI scheme or credential
must exist to choose a language. Configuration changes that own the directory
must finish before language can be saved; the UI reports failure without clearing
the form. Reopening after moving or renaming reads preferences from the new root.

The kernel build includes the setup catalog and shared language/error modules.
Regenerate/check the maintainer manifest after integration. Do not regenerate a
recipient baseline. Native launcher language handoff belongs to the configuration
and launcher owners; this service reads the final actual project preference again.
