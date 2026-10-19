# Thin app bootstrap and dependency preparation

TASK-20261019-032, Codex, kernel0.9.4.

The compiled `.app`/`.exe` locates its complete project folder relative to the
executable. If the pinned project-local Node executable is absent, it runs the
existing private OS bootstrap with `runtime-only`. macOS uses system Bash;
Windows uses `kernel/scripts/windows/bootstrap.ps1` through PowerShell directly,
without Git Bash. The Bash Windows installer encodes this same private script.
No global Node, compiler or shell configuration is installed. Official download
checks and project-local runtime locking remain in the platform bootstraps.

After preparation, the native executable starts project Node with
`kernel/launcher/entry.mjs --launch` and exits. It contains no embedded application
or dependency installer. Runtime preparation failures are recorded under
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
