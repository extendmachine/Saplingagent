# Configuration capsule deployment

The complete source folder is required. Installation prepares the project-local
kernel dependencies; full project setup builds the page and stages a self-contained
management capsule. A copies it plus Node to `../sapling-config-<random>/`,
a visible sibling beside the current project,
starts B and exits. Complete settings and choose Save & build app, wait for success,
then Finish setup. Open the resulting .app/.exe inside the full project folder.
It checks and installs missing/changed dependencies before starting the app.

On macOS the generated app remains visible in the Dock. Save & build app first
asks that project's app to exit and waits for its startup worker and process
handles to close, then stops the existing project runtime before rename or
replacement. A busy/uncertain native process leaves the saved settings and current
folder in place with an error; inspect it and retry. After Finish setup, open the
new app normally. Dock Quit stops that project's existing service cluster through
the launcher; it does not stop other applications.

Project data, settings, toolchains and output stay inside the project. Only the
running management capsule is temporarily external beside the project under
explicit owner policy. No system-temp destination, home installation or arbitrary
absolute output override is accepted. Session receipts store sibling names and
filesystem identity; use the terminal’s printed relative folder to inspect it.
Keep it in place while configuration is active.
A deletes its verified capsule after B exits. A failure leaves saved settings and
sanitized project receipts; inspect errors and retry from the actual current
folder. An external editor or antivirus may still refuse a rename. Do not delete
credentials, change Git or regenerate a customer manifest to repair setup.

Source recovery is explicit through existing kernel backups. No automatic rename
reversal or business-data restore. Native Windows file locking and actual model
account use require separate acceptance; macOS checks do not establish those.

Before upgrading this layout, finish any existing old configuration page. An
unclosed legacy session is preserved and reported rather than removed from an
unrelated system directory. Two projects receive independent sibling capsules and
ports. Two launch attempts for one project reuse the verified page or report its
operation lock; they do not create competing configuration owners. Stale metadata
with uncertain ownership requires inspection. Successful Finish setup waits for B
to exit and lets A delete only its matched sibling; the completion receipt stays
in the project's `.runtime/`.


## Configure AI from the application

Open the main page's top-right Settings, then Configure AI. The runtime gateway
starts a short-lived bootstrap and opens/reuses an AI-only page in the default
browser. Repeated clicks share one job. The page contains account/API/MCP
configuration, without project-name, folder, icon or app-build steps. Opening or
reading it leaves services running. The first AI write/login pauses this project's
owned processes before credentials can change. Finish closes the login process,
cleans the external capsule and restarts the existing app without recompiling it.
Save current work before editing credentials; busy shutdown is reported rather
than interrupting an active AI task. Existing conversations and application source
are retained. A read-only visit can simply be closed through Finish with no restart.

If the browser cannot open, paste the verified loopback URL into a new address
bar. The explicit terminal fallback is:

```sh
bash Saplingagent.sh configure --ai-only
# Optional: print the configuration URL without opening a browser.
bash Saplingagent.sh configure --ai-only --no-open
```

Plain `configure`, the installation menu and initial setup retain the full project
workflow. An already open page in the other mode must be finished or closed first;
its unsaved work is not silently discarded. Do not bypass Host/Origin checks or
use a fixed port. After Finish, inspect `.runtime/ai-configuration.json` and
`.runtime/configuration-complete.json` if restart did not succeed. Saved AI
configuration and failed application startup are separate results. Logs remain
under `logs/project-launcher`. A code update requires one cold launch of an
existing runtime controller; no native recompilation is required. Kernel remains
0.9.9.

Direct development startup also supports Configure AI. The runtime bridge
canonicalizes the project directory before launch and discovery, so the default
directory URL's trailing separator cannot cause a successful configuration host
to be reported as CONFIGURATION_START_FAILED. After updating this bridge, fully
stop and start the owned runtime controller once; Restart app alone retains that
controller. Do not delete a live configuration capsule to work around the error.
