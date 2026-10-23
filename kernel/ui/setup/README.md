# Standalone React AI setup page

This separate React/Vite entry is contained in the kernel and uses
`kernel/package-lock.json`, independently from application dependencies. The
shared `kernel/launcher/setup-ui.mjs` prepares `kernel/.cache/setup` through a
staged build. The configuration service serves the compiled page on its own
loopback port; no chat page or Vite development server is needed.

The language selector supports English and Chinese and saves the choice to the
project through `/api/config/language`. Saved project language is authoritative;
without it the explicit launcher language, browser language and English are the
fallbacks. Language follows folder renames and port changes. Switching it preserves
unsaved fields, credentials and operation state; it does not call a model or
translate saved conversations, scheme names, paths or identifiers. Account/API
tabs support saved schemes, default activation,
custom API URL/protocol/model/key and optional model discovery. A blank credential
when editing the same saved authentication kind keeps its credential. Changing
authentication kind or engine requires a new credential. Typed credentials are
cleared after save/finish and when changing tabs, presets, engines or authentication
choices; saved keys
are never returned to the browser. Account/key data never enters browser storage.
Official login opens the provider page and polls status, with an explicit link if
the popup is blocked. Saving settings/building does not send a model prompt or
change the engine of existing conversations.

## Personal Claude subscription token (TASK-20261022-003)

The Claude tab offers separate API-key and Subscription token (personal use)
choices. The subscription form contains a scheme name, password input and model
ID/alias. It does not offer an API URL, protocol, no-auth option, model discovery
or API-credential import. It directs the account owner to run `claude setup-token`
in their own terminal and manually paste the result; this page does not initiate
subscription sign-in or read subscription login files. See the
[official token guide](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token).
Access and billing follow Anthropic's current conditions. Saving does not verify
the token, plan eligibility, model access or quota, and does not establish permission
to offer subscription authentication to other users.

`profile-draft.ts` explicitly constructs POST `profiles` payloads. Subscription
sends only `id?`, `label`, `engine:'claude'`, `kind:'subscription'`, `model`,
write-only `apiKey`, `revision` and `activate`. API-only fields and `hasKey` are
omitted. Saved subscription metadata retains its kind when opened for editing.
Only an unchanged saved kind with `hasKey:true` permits a blank password; crossing
API/subscription modes clears both the typed credential and the saved-credential
hint. The service independently validates credential types and saved revisions.
The draft uses the existing dirty-state, form validity and Save & build ordering.
Saved scheme labels distinguish API, account and subscription token. Labels,
guidance and relevant errors follow the English/Chinese toggle.

## External AI / MCP (TASK-20261021-005)

A parallel External AI / MCP tab configures the standalone kernel stdio service;
it is not another model provider. Enable access and optionally choose external-only
mode to skip built-in model login. MCP supplies no model for web chat; without a
configured built-in provider users converse in their own AI client. Existing
account/API schemes remain saved and usable by web chat, and saving a scheme never
changes MCP choices. The page explains current
OS-user Full Access, accessible external paths, no root/admin elevation and the
external client's own approval policy. The MCP service does not require the app
to be running.

`McpAccess.tsx` reads GET `/api/config/mcp`, saves exactly
`{revision,enabled,externalOnly}` to POST `/api/config/mcp`, and handles its independent
revision. No generated path is saved in settings. Dirty MCP choices block Finish;
Save & build saves them before finalization. A conflict leaves the choices dirty
until the user explicitly reloads the saved settings and reviews them. Built-in
readiness is a selected profile OR saved enabled/externalOnly MCP settings; actual
export readiness and launcher artifact remain server-owned requirements.

Project root/artifact/compile-time changes refresh the generated client configuration
after rename/build. Copy JSON and Download JSON each fetch it again at click time,
so they cannot reuse the pre-rename path. Exports require enabled, available access
and clean settings; clipboard failure never reports a successful copy. Downloads
contain only the MCP client configuration, not private profile/settings state. No
global AI-client file is written. The user adds the configuration to their own
client and replaces old paths after moving/exporting. Disconnect the MCP server in
that client before maintenance/rename, particularly for Windows process/file locks.
All managed controls and workflow explanations follow the English/Chinese toggle.

## External configuration workflow (TASK-20261019-033)

The management frontend/backend runs in the temporary external configuration
host B. `GET /api/config/project` identifies this with
`configurationHost: "external"`. Its URL and HTTP token stay valid while B changes
the working folder. Canonical source remains inside the complete project.

1. Save the project name, desired folder and icon through
   `POST /api/config/project/save`. This does not rename the directory.
2. Configure AI after `settingsSaved` enables account/import/provider controls.
   Existing import and login actions retain their explicit save semantics.
3. Choose **Save & build app**. The page validates any edited API form while the
   fields are enabled, saves identity and the pending API form, then calls
   `POST /api/config/project/finalize {}`. The response identifies a `configure`
   job. The page keeps polling normal project state at the same URL while B
   closes owned project processes, applies the folder name, stores the settings
   and builds the native launcher in the project. It does not reload, poll a
   replacement server or repeat the accepted request.
4. Wait for successful build/readiness, then choose **Finish setup**.
   `POST /api/config/close {}` must acknowledge `{closed:true,handoff:true}`.
   The page stops polling and displays the saved launcher path. B hands back to
   project entry A; after B exits, A removes B's owned temporary directory.
5. Double-click the small native app. It checks and installs missing dependencies
   before opening the project. Keep the launcher with the complete project folder.

The same steps and timing are explained in both languages. Finish requires
server `exportReady`, a real launcher artifact, a selected AI scheme or saved
enabled/externalOnly MCP access, clean identity/API/MCP forms and no active or
failed job. A new AI or MCP configuration revision
refreshes readiness. Failed builds stay visible and can be retried through
Save & build app without replacing the prior usable launcher. Rebuild app uses
`POST /api/config/project/build` when current settings are ready. Show launcher
reveals the existing artifact. Runtime controls remain visible for an existing
running runtime; a fresh completed setup simply tells the user to open the app.

The project snapshot, not a successful POST alone, confirms the final root and
build result. A missing/incorrect configure job cannot establish acceptance;
a close response without the external handoff cannot display completion.
No health or configuration polling continues after the completion page appears.

## Older in-project management compatibility

Snapshots without the external-host discriminator retain the prior Save settings
& restart → verified restart → Export app flow. The old finalization response
uses its exact job ID to match unauthenticated `/health/project-launcher`
readiness before reloading with the replacement token. Expected connection loss
is tolerated; pending/unrelated receipts do not imply success. Export remains
disabled until verified readiness and clean saved configuration. This fallback
supports older server fixtures; it is not the new external configuration flow.

## Project and credential controls

`ProjectSetup.tsx` normalizes PNG/JPEG/WebP icons to a256×256PNG, shows actual
OS/architecture/root/kernel version and consumes bounded async progress. Identity
inputs are separate from account/API secrets. An icon is served only from the
known PNG path without a credential in its URL. Maintainer worktrees stay in
place; only a selected independent customer folder may move without replacing an
existing folder. Failures show the actual service error.

Codex offers Use local Codex login and Upload auth.json. Claude offers local
API-key import and API credential JSON upload with editable URL/model. The file
picker resets for repeat selections; `import-file.ts` validates bounded JSON
without echoing parse content. Uploaded text is never retained in React state or
browser storage. Replacement requires its explicit checkbox. Protected imports
reject pending OAuth/stale revisions and never restart or call a model. Both
languages explain keychain/subscription limits and local-storage-only success.
Import progress, errors and success appear next to the relevant controls.
These API imports are hidden for a subscription draft; subscription tokens are
entered only in the separate password input described above.

## Verification

Use the project Node runtime with:

- `node --experimental-vm-modules --test kernel/ui/setup/*.test.mjs`
- `npm --prefix kernel run typecheck`
- `npm --prefix kernel run build:setup`

The flow and MCP tests cover saved identity access, dirty/readiness/artifact/job gating,
external configure acceptance and cleanup-handoff acknowledgement, plus legacy
restart receipt identity. Component interaction tests cover MCP toggles, revision
conflicts, late refresh isolation, copy failure, download dispatch and current-path
refresh without a live model or client configuration write. Kernel-local TypeScript/React types are development
dependencies. Production installation builds with the kernel Vite dependency.
Integration/browser checks and native process/Windows/provider acceptance are
reported separately; source tests and compilation do not establish those results.
Subscription component tests execute the actual setup App in an isolated React
hook/DOM fixture. They check payload omission, API/subscription conversion, saved
subscription editing, secret clearing across tabs/presets/engines, build validation
and Chinese errors without any real credential, login or model call.
Shared API details belong to `kernel/services/ai-config/CONTRACT.md` and
`kernel/launcher/CONTRACT.md`; project-facing guides are maintained by the parent
integration task.


## Central language and error presentation (TASK-20261023-008)

`kernel/localization/setup-messages.mjs` is the keyed bilingual setup namespace.
`localization.tsx` uses the shared formatter and error contract for labels, ARIA
text, notices, MCP controls and project/build status. Notices store keys and
parameters; errors retain stable codes and sanitized original details behind a
closed disclosure so changing language also redraws existing feedback. Technical
build logs remain original text in their details section. Unknown failures still
show a localized summary and next action.

The initial language request cannot override a later explicit selector change.
The selector updates the document language/title without remounting the editor;
language writes are independent of AI profile revisions and export receipts.
Help opens `/help?lang=en|zh`; its own selector uses the same authenticated
configuration endpoint. Setup HTTP adds a per-response script nonce to that page.
The shared server API follows its actual root after relocation, not a remembered
origin or old path. No account data is stored in browser storage.

Synthetic tests cover catalog parity/interpolation, all UI message references,
late preference responses, credential and project-draft retention, relocalized
notices/errors, and unchanged MCP save/export behavior. Tests make no account or
model calls. Native Windows and real provider acceptance remain separate.
