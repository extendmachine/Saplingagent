# External configuration capsule (A / B)

TASK-20261019-031/034. Kernel0.9.4, Node built-ins only. `launcher/entry.mjs` is A:
`--launch` checks project dependencies and starts the application; its default
configuration action prepares `kernel/.cache/configuration/`, copies the closed
backend module graph and built UI plus a private Node executable to an external
OS temporary folder and starts B. There are no source/dependency symlinks to the
project. A returns after B acknowledges its address. Opening the same live
configuration reuses its verified root/instance; independent projects have separate
capsules and OS-assigned ports.

`configuration/host.mjs` is B. Its executable, code, assets, cwd, temporary files
and inherited descriptors are external. Credentials/data remain in the project.
Project name/icon/folder and AI are saved before POST /api/config/project/finalize
{} returns202 {job}. B stays on the same URL, stops only the owned idle application,
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

`.runtime/configuration-session.json` and external session.json bind session id,
nonce, root, process ownership and temporary location. No provider secrets are in
these records. In-progress save/build uses the existing setup lease to exclude
competing start/update. Failed rename/build retains the actual current project and
B page with explicit error; no automatic rollback. Crashed/unknown sessions are
reported for inspection, never arbitrary PID termination or directory deletion.
Cleanup is owned by A only after B is gone, allowing Windows executable deletion.
Native Windows hardware acceptance is separate from source/isolated checks.
