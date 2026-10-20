# Thin app bootstrap and dependency preparation

TASK-20261019-032, Codex, kernel0.9.4.

The compiled `.app`/`.exe` locates its complete project folder relative to the
executable. If the pinned project-local Node executable is absent, it runs the
existing private OS bootstrap with `runtime-only`. macOS uses system Bash;
Windows uses `kernel/scripts/windows/bootstrap.ps1` through PowerShell directly,
without Git Bash. The Bash Windows installer encodes this same private script.
No global Node, compiler or shell configuration is installed. Official download
checks and project-local runtime locking remain in the platform bootstraps.

On Windows, the native executable shows lightweight preparation progress, starts
project Node with `kernel/launcher/entry.mjs --launch` in its own process group,
and follows startup until the verified gateway/status page takes over or the
startup task exits. The helper then exits; the existing service manager remains.
Closing the progress window only hides the display. On macOS, a system-compiled
stay-open applet owns an ordinary Dock application and calls the same small Go
helper for lifecycle commands. The helper remains cancellable while preparing
Node and awaiting application startup; the applet remains responsive. Neither
contains embedded application source or a second dependency installer. Runtime preparation failures are recorded under
`logs/project-launcher/` and shown as a launcher error; a missing full source
folder cannot be repaired by downloading Node alone. Concurrent Node downloads
retain the existing installer lock behavior and ask the user to retry.

`ensureApplicationDependencies(root, {onProgress})` is the shared JavaScript
entry used by daily launch. The internal CLI action `ensure-dependencies` exposes
the same headless operation. It never opens setup, checks a remote login, calls a
model, resets account/project configuration or initializes customer Git.

`applicationDependencyStatus(root)` checks the core, frontend and package-based
immediate backend services. Packages declaring dependencies require a local
`package-lock.json`; dependency-free services do not. It compares package and
lockfile hashes, platform/architecture, direct installed package versions and
entry files, and the required frontend/AI executable markers. Local-file npm
packages are supported. A valid legacy installation signature can be adopted.
This is an installation/readiness check, not an exhaustive hash audit of every
transitive package byte. Explicit dependency repair remains available for other
damage.

Preparation serializes through the existing OS installation lock. A second
launcher waits up to two minutes and rechecks completed work. Interrupted/unknown
locks are retained for inspection. Missing or changed groups are installed with
project npm/cache only; unchanged groups are reused. Declared package and lock
files are not rewritten. Codex downloads stage and verify the configured version
before replacing the previous installation; npm failure can leave a service tree
incomplete and the next launch retries it. Per-group receipts are saved in
`.runtime/dependencies.json` only after checking the result. Source declaration
changes during installation invalidate success. Normal dependency installation
is blocked during kernel maintenance or while a live app needs a package repair;
stop that project and retry. Other project folders remain independent.

No source/data rollback is automatic. The dependency helper runs as the current
OS user and does not add an Agent file permission boundary. Existing setup/build
flows remain responsible for their own configuration and compilation; the
coordinator wires the daily entry and external configuration handoff.

Verification: isolated helper tests include changed declarations, missing files,
concurrent activation, failed and resumed installation, live-runtime/maintenance
interlocks, and real offline npm installation of a synthetic local package.
Compiled macOS launcher checks cover Unicode paths, missing Node and subsequent
reuse; the same Go source cross-compiles for Windows x64/ARM64. Windows runtime,
PowerShell downloads, antivirus/file locks and real account/model behavior still
require native acceptance. No customer folder or global account was modified.

Managed scratch/cache paths now stay in the project (`.runtime/`, `.cache/`,
`local-secrets/runtime/`, `data/runtime/`) or the explicitly owned sibling setup
capsule. macOS and Windows Node bootstraps bind temporary storage before using OS
network/extraction tools. Native launch rejects redirected managed directories.
The pinned Go1.27.2 toolchain receives `TEST_TELEMETRY_DIR` pointing at the project
and an `off` mode marker; this is verified against that pinned compiler's source
and a real local invocation. Future compiler pin changes must recheck this behavior.

## macOS Dock application (TASK-20261019-043)

macOS compilation uses the built-in `/usr/bin/osacompile` to produce a stay-open
AppleScriptObjC applet. Foundation supplies its real PID, per-launch nonce and
asynchronous task handle. `LSUIElement=false` gives it regular Dock activation.
The helper remains CGO-free Go; no Xcode, Command Line Tools, Electron or new
business service is installed. The existing project services and browser UI stay
unchanged. The system applet and helper are ad-hoc signed together after icon and
metadata preparation. This does not represent Developer ID signing/notarization.

Opening/reopening calls the public Node lifecycle bridge through the helper.
Normal Quit requests cancellation and shutdown from that bridge, then waits for
the pending helper to exit. A failed stop leaves the Dock app running with an
error so the user can retry. A configuration handoff exits without issuing a
second stop. Force Quit and OS crashes bypass normal cleanup; open the app again
and use normal Quit to request the owned runtime shutdown. The configuration
coordinator must close the Dock application and startup helper before replacing
the bundle or renaming the folder.

Only start/open may bootstrap missing Node. Status/stop never download anything.
During the initial download, native cancellation signals only its newly created
bootstrap process group and waits; the script first gets time to release its
installation lease. Once Node is running, its own signal handler performs service
and installer cleanup. The helper does not kill unrelated Node processes. If
Node is missing while recorded project runtime metadata still identifies a live
PID, Quit reports the damaged installation rather than claiming the runtime stopped.


## Native startup feedback (TASK-20261019-049–050)

macOS uses a small nonmodal AppKit window within the existing Dock applet. Windows
uses a small Win32 window in the existing Go helper. There is no additional UI
framework, terminal tail process, HTTP server or global install. The progress
display covers preparation before the runtime gateway is available. Native
Windows consumes fixed semantic phase markers only; arbitrary dependency output
stays in the local launcher log. The gateway's project status page takes over
while application services may still be starting; a browser-open failure leaves a printed local URL for retry. The native
window can be hidden without stopping services. Stop app and normal Mac Quit are
the explicit shutdown actions. Rebuild an older exported launcher to use the
new native display. Windows hardware acceptance remains distinct from compiling
the x64/ARM64 artifacts.
