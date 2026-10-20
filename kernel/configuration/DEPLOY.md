# Configuration capsule deployment

The complete source folder is required. Installation prepares the project-local
kernel dependencies; Configure AI builds the page and stages a self-contained
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
