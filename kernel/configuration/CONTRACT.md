# External configuration capsule (A / B)

TASK-20261019-031/034, updated by TASK-20261019-038. Current kernel0.9.6, Node built-ins only. `launcher/entry.mjs` is A:
`--launch` checks project dependencies and starts the application; its default
configuration action prepares `kernel/.cache/configuration/`, copies the closed
backend module graph and built UI plus a private Node executable to an external
direct sibling folder `../sapling-config-<random>/` and starts B. There are no source/dependency symlinks to the
project. A returns after B acknowledges its address. Opening the same live
configuration reuses its verified root/instance; independent projects have separate
capsules and OS-assigned ports. The response includes the non-secret
`relativeDirectory` for the terminal to show where its capsule is running.

`configuration/host.mjs` is B. Its executable, code, assets, cwd, temporary files
and inherited descriptors are external. Credentials/data remain in the project.
Project name/icon/folder and AI are saved before POST /api/config/project/finalize
{} returns202 {job}. B stays on the same URL, closes this project's resident macOS
Dock app through `launcher/public.mjs` `closeDockForMaintenance(root)`, then stops only the owned idle application,
closes owned authentication, waits for original bootstrap processes, moves the
folder without replacement, rebinds its stores/discovery, compiles the tiny native
launcher into that final folder and reports completion. It does not generate a
model request. GET project adds configurationHost:'external'; job polls progress.
Build/rebuild reuses this same saved-settings operation. External configuration
does not expose app open/restart actions; finish setup and open the app instead.
Stopping an already running owned app remains available. Existing API tokens,
Host/Origin validation and Full Access remain unchanged.

POST /api/config/close returns {closed:true,handoff:true}. B launches the current
project's A with its private session receipt. A checks the session, project identity,
external directory ownership and B PID, acknowledges takeover, waits for B exit,
then deletes only that external capsule. A writes a project-local completion receipt
and exits. It never immediately launches B again. The page displays completion;
the user opens the generated app to develop. The app automatically checks/installs
local declared dependencies before starting. It is a bootstrap, not a packaged copy
of application source or an independent global installation.

Schema2 `.runtime/configuration-session.json` and external `session.json` bind
session id, nonce, process ownership, relative project/capsule basenames and
filesystem device/inode identities for both directories and their shared parent.
Absolute runtime paths are resolved internally; no user-selected temp path or
OS/home temporary fallback is accepted. The sibling, project and receipt files
must not be symlinks. Same-parent rename preserves ownership; moving/replacing
the parent or capsule fails closed for inspection. No provider secrets are in
these records. In-progress save/build uses the existing setup lease to exclude
competing start/update. Failed rename/build retains the actual current project and
B page with explicit error; no automatic rollback. Crashed/unknown sessions are
reported for inspection, never arbitrary PID termination or directory deletion.
Cleanup is owned by A only after B is gone, allowing Windows executable deletion.
Native Windows hardware acceptance is separate from source/isolated checks.

## Storage and lock boundaries

All persistent configuration, credentials, dependencies, build output and receipts
stay in the project. The only temporary external execution folder is its visible
`../sapling-config-<random>/` sibling. B's code, executable, cwd, temporary files,
XDG storage, npm and Node caches are inside that folder. Imported account locations
may be read explicitly; this is a managed-storage policy, not a restriction on the
customer Agent's Full Access. Canonical source remains in `kernel/`.

Configuration startup and returning-A cleanup hold the shared exclusive kernel
operation lease before inspecting or reclaiming a dead management/cleanup lock.
Live, invalid or uncertain owners are preserved. If a spawned B cannot have its
PID receipt persisted, A closes its operation descriptor but retains the operation
and management receipts for inspection instead of permitting stale-session cleanup. Stale sessions are removed only
when schema2 sibling identity and both receipts match and their PID is gone.
Returning A rechecks after B exits; it never unlinks a live executable. Missing or
replaced directories fail with an actionable ownership error. Existing schema1
sessions must finish through their old page before upgrading; new code neither
adopts nor removes their old absolute temporary locations.

Build checks the native compilation lock before and under setup/kernel leases.
Before acquiring those leases, B asks the verified native app to release its
bundle and cancel any startup worker; waiting while holding a startup worker's
operation lease could deadlock configuration. It repeats this handoff under the
setup/kernel leases before moving the folder. The native-close public contract
checks the project-bound process registration and waits for exit. Missing native
registration is a no-op; an uncertain owner, refused handoff or timeout fails the
configuration job before rename/replacement. It never force-kills arbitrary PIDs
or changes service topology. The existing runtime stop/drain follows the first
native close. Normal setup does not reopen the app automatically; after Finish
setup, opening the built app restores its Dock presence and starts the same services.
Only the same setup owner may compile while holding its finalization lease; a
separate compiler uses the operation lease to exclude rename. The shared AI configuration writer lease also spans ledger capture, movement and
root rebinding; a competing CLI settings write cannot cross a rename. All lock
descriptors are closed before folder movement. Renaming remains confined to the same parent
and never replaces an existing destination. External editors or antivirus may
still refuse a rename; report the error and retain saved state for retry.

The published `configuration/public.mjs` operation `moveProject(previous, current)` is also used by the legacy launcher under its operation lease. It refuses an existing destination, including one created while the native app was closing, and never moves outside the current parent. This exposes the existing platform move behavior without adding another service.

## External MCP connection during relocation (2026-10-21)

The builtin-only MCP configuration contract is part of the copied configuration capsule; the SDK and standalone stdio server are not capsule dependencies. B can save enabled/externalOnly settings without a provider account. An active or unverifiable MCP ownership receipt blocks finalization before stopping app services and again after maintenance leases are held. The user disconnects this project's MCP connection, then retries. No external client host is killed. Exported MCP command/args are regenerated against the final root after relocation.
