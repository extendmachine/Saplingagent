# Standalone React AI setup page

Separate React/Vite entry, fully contained in the kernel and using kernel/package-lock.json without application dependencies. `node kernel/node_modules/vite/bin/vite.js build --config kernel/ui/setup/vite.config.mjs` emits only kernel/.cache/setup. kernel/services/ai-config serves the compiled page on its own loopback port with the public setup HTTP contract. No Vite dev server/chat/auth prerequisites. Root main chat remains unchanged except using the saved default engine for a fresh session.

English default; follows launcher zh or user language toggle. Account/API tabs, saved schemes, explicit default activation, custom API base URL/protocol/model/key, optional discovery and model limits. Never read a saved key into the browser; blank edit retains it, typed keys are cleared after save/finish. No localStorage/sessionStorage for account or key. Official login opens separate provider page and polls completion; blocked popup has an explicit link. Close setup closes only the configuration service. Save settings & restart is a separate explicit handoff described below; no paid model test, prompt, or conversion of existing sessions occurs. UI references front CONTRACT and kernel/services/ai-config/CONTRACT; real provider/hardware acceptance stays pending.

TASK-20261013-003: Codex account panel offers explicit Use local Codex login and Upload auth.json. Claude API tab offers local API-key import and API credential JSON upload with editable URL/model. CredentialButtons resets the file picker so the same file can be selected again; import-file.ts validates the bounded JSON without echoing parse content. Inputs are cleared after selection; uploaded text is never retained in React state/browser storage. Existing account/scheme replacement requires the explicit checkbox, reset after successful import or selecting a Claude scheme. Both languages explain keychain/subscription limits and local-storage-only success. Auth imports use protected POST /api/config/credentials/import, reject pending OAuth and stale revisions, and do not restart or call a model.

## 0.9.3 project setup

Four steps: edit and save name/folder/icon; configure AI schemes; save settings and wait for verified restart; export the native app and manage its runtime. ProjectSetup.tsx consumes /api/config/project, normalizes image uploads to a256×256PNG, displays actual OS/arch/root/version, polls bounded async progress, and offers open/restart/stop/rebuild/reveal. The independent host builds with kernel/node_modules Vite/React, without business dependencies. Project inputs stay separate from account/API secrets; save/rebuild does not send prompts. Generated icon is served only from the known PNG path with no credential token in image URLs. Development worktrees are not renamed; an explicitly selected independent customer folder is renamed only by the external offline helper after settings are saved and owned processes exit. Failed builds show an actionable error and retain the previous artifact.

## Credential import feedback (TASK-20261018-007)

Local and uploaded credential imports show pending text on the clicked button and a live status directly inside that engine's import panel. Success and errors stay beside the controls, including on the longer project-setup page, rather than above step1 outside the viewport. Existing Codex credentials offer Use saved account or an explicit replacement retry. Other actions clear the scoped result; no credential contents enter feedback. The HTTP and replacement contracts are unchanged; a successful import confirms storage/selection only, not provider access.

Maintainer checks: run `npm --prefix kernel run typecheck` and `npm --prefix kernel run build:setup`. React types and the compiler are kernel-local development dependencies. Installation builds through the kernel Vite dependency; it does not require the application frontend.


## Deferred folder finalization and app export (TASK-20261019-025)

The first card saves project identity/icon and the intended folder through
`POST /api/config/project/save`, without moving the current directory. The server's
`settingsSaved` flag permits account sign-in/import and custom provider editing at
that current location. Project and credential data remain local; saved credentials
are never returned to the browser.

The page explicitly instructs both English and Chinese users: **Finish changes →
Save settings & restart → Wait for restart → Export app**. Save settings & restart
first saves the current identity and any edited API form (using browser validity
checks), then calls `POST /api/config/project/finalize`. Existing explicit account,
credential-import and scheme actions keep their own storage semantics. No model
prompt is sent. Close setup is a distinct management action, not a save, rename,
restart or export action.

The accepted202 response identifies a finalization job. The page disables edits
and export while the temporary outside-project system helper closes verified owned
processes, releases project handles, applies the folder name and resumes services.
Expected connection loss is not shown as a configuration failure. It polls only
same-origin `GET /health/project-launcher`, without reusing the old configuration
token. A matching job receipt with ready/failed phase reloads the page to acquire
the new server token and show the actual result. Unrelated, missing or pending
receipts cannot establish success. Slow restarts show recovery guidance after two
minutes and continue checking; the browser never repeats the finalization request
or kills a process because a timer elapsed.

Export app calls the existing real native build only when `exportReady` confirms
post-handoff readiness, an AI scheme is saved, and neither identity nor API form has
unsaved edits. Configuration revisions refresh readiness so later scheme changes
require another save/restart. Runtime actions and launcher reveal remain available
outside active operations. Existing launchers are preserved on build failure;
export handles owned idle runtime coordination through the launcher contract.

Verification: `node --test kernel/ui/setup/setup-flow.test.mjs
kernel/ui/setup/import-file.test.mjs`, kernel-local TypeScript and Vite build.
The flow tests cover saved-settings AI access without directory confirmation,
post-restart/dirty-state export gating and exact finalization receipt identity.
Integrated browser and native process/Windows acceptance are reported separately,
not inferred from source tests or compilation.
