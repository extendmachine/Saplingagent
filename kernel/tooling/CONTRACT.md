# Shared tool runtime

TASK-20261103-001. This kernel module resolves third-party programs and the thin
engine SDK group. It creates no daemon or model request. Full Access and project
process ownership are unchanged.

## Resolution and installation

Node bootstrap checks its project alias, then a compatible PATH installation,
then the user library. Missing/incompatible detection downloads the device pin.
The native App retains its canonical project Node path through symlinks/junctions;
link-unavailable filesystems get a Node/npm copy. Machine PATH and original
installations are not edited. ensureTools checks saved bindings, PATH/common CLI
paths and shared versions before installing. Detection uses version/help only.

The first implementation reuses exact tested versions: Node24.21.0,
Codex0.146.1 (with app-server), Claude Code2.1.296, OpenCode1.19.0, Go1.27.2.
A newer unverified tool is retained; the supported version coexists.

Default home: Windows %LOCALAPPDATA%/Saplingagent; macOS
~/Library/Application Support/Saplingagent. SAPLING_RUNTIME_HOME selects an
explicit library. SAPLING_RUNTIME_MODE=portable uses .runtime/tool-store and
does not reuse external CLIs. Source, settings, credentials, conversations,
logs, project temporary state, build output and application node_modules stay
project-owned. This is the approved rule11 exception, not an Agent restriction.

SDK lock: kernel/tooling/sdk/package-lock.json. Install this isolated group with
--omit=optional --ignore-scripts and select the detected/installed Claude program
with pathToClaudeCodeExecutable. Do not omit optional native packages from the
React/Vite group. Legacy kernel/Agent dependency paths remain fallbacks.

## Stored interface and concurrency

.runtime/tool-bindings.json schemaVersion1 contains root, mode, home, signature,
tools{name:{path,version,source,fingerprint,alias}}, optional combined sdk{path,signature},
and per-provider sdks{engine:{path,signature}}, with
no credentials. Copy/move rebases contained tool paths to the actual root;
missing or changed external references are prepared at the next launch. Fingerprints detect changed or removed programs.
.runtime/tools/ contains directory symlinks/junctions; if unavailable callers
use real paths. Never symlink project state directories.

Each shared component has a version/device lock. Stage, validate, rename to a
new generation and atomically publish an index. Concurrent projects wait and
reuse; failures retain older generations. Index directories and contained Unix
aliases are relative, so portable projects can move. Windows portable Node uses
a copy rather than an absolute junction. A separate project tool-setup.lock
serializes alias/receipt updates. Interrupted locks are reported for inspection.
Install children receive project account/state paths with inherited credential
variables removed; cancellation targets only their owned process trees.

App launch, installer, dependency repair and full app/backend restart use this
resolver. Recheck after kernel dependency replacement: npm ci may remove a CLI
that was discovered in the old kernel dependency tree; repair its binding before
continuing configuration or startup. Go is prepared only for native compilation. There is no automatic
shared-library garbage collection: deleting a project does not remove tools.

## Validation

Tests set isolated library homes inside this repository. Local CLI reuse, SDK
installation without optional native binaries, two fresh Mac installs,
configuration HTTP, concurrent installs and repair are checked separately.
Native Windows junction/install acceptance remains pending. No model/account
entitlement or real authentication is implied.

On macOS the Node downloader holds an OS advisory lock for the current version
and architecture. Concurrent installers recheck the library after acquisition.
A persistent lock file can be reused after a crash or reboot. The downloader
publishes a unique complete generation, including when an older installer left
its directory lock behind. Existing generations remain usable.


## On-demand provider tools and installation modes

Initial setup prepares Node and the configuration UI. Runtime preparation uses the active provider; external-only MCP prepares no built-in provider. Codex needs its CLI. Claude and OpenCode each use their own CLI and pinned JavaScript SDK. A user can explicitly select another engine or start Codex sign-in to prepare its tools. Checking the catalog does not download an unselected engine. Dependency repair and project shutdown carry cancellation through shared-tool waits and subprocesses. Switching installation mode refreshes the project bindings and removes stale external aliases in portable mode. Go is prepared for native compilation.

A mode switch takes effect for the whole project. An explicit environment
selection takes precedence over the Node bootstrap's saved mode marker, then
the previous binding receipt. Readiness checks that the selected tools and SDK
resolve to the current installation. Portable mode also checks their actual
locations inside this project after a move or copy. Windows portable tools use
rebased executable paths because Windows junction targets are absolute. Shared mode reacquires
programs from PATH or the selected library after a switch. Go is optional until
compilation and a binding from another mode may be discarded without downloading
a compiler. A mode change preserves installed tool generations and project data.

### Ordinary project npm installs

Setup, dependency repair and kernel maintenance keep npm's working cache at
`.cache/npm` and install each group's own `node_modules`. In shared mode the
installer copies verified public tarballs between the working cache and
`<tool library>/cache/public-npm-v1/sha512/`. Install scripts, npm logs,
registry indexes and credentials stay in the project. A filesystem with clone
support can reuse disk blocks. Each project can change or remove its files
independently. A cold concurrent install can download the same package twice.
Portable mode uses its local cache throughout.

The bridge supports npm's content-v2 SHA-512 storage used by the pinned npm.
It verifies each newly copied blob against the lockfile digest before atomic
publication. Cache misses, filesystem errors and unsupported packages fall
back to the ordinary npm install. An altered lock may read existing blobs
matching canonical public registry URLs and SHA-512 integrity. A project can
publish only the bytes for the public package set reviewed by the maintainer.
Private registry URLs and custom tarballs do not enter the library.

When changing a seed lock, verify each unique registry tarball URL and integrity
against the corresponding package version's anonymous public npm registry
metadata. After verification update the group's entry in
`public-npm-locks.json` with the lowercase SHA-256 of its sorted, unique
`resolved + space + integrity` lines, joined with newlines and no final newline.
The test in `test/npm-cache.test.mjs` checks the fingerprints and exercises two
independent projects with the actual npm CLI offline.

## GNU/Linux

On GNU/Linux the installer looks for the pinned official Node/npm on PATH and in the user library. When absent, it downloads the selected Linux architecture from nodejs.org, checks the official SHA-256, and publishes the complete runtime under a per-version installation lock. Shared mode uses the user library and portable mode uses the project store. A
project-local alias points to it in shared mode; portable mode copies the Node
executable and npm tree under .runtime/tool-store and uses a relative alias.
The default shared AI tool library is ~/.local/share/Saplingagent. Linux
terminal startup uses no Go compiler or native desktop launcher.
