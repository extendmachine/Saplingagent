# Local boot and macOS source package delivery

Saplingagent.sh is the single macOS user entry. Run it with bash in Terminal and select English or Chinese. Its interactive menu provides installation/update, Codex or OpenCode configuration, startup and diagnostics. Internal helpers retain project-local runtime, credential and owned-service behavior. See docs/macos-install.html for the recipient steps; see scripts/macos/README.md for AI maintenance contracts and official sources.

At present, the unified entrance `node scripts/dev.mjs` has been realized, locate the application root directory from the script location, and run workspace4311, app-builder4312, agent4310 and single-page front-end 5173; do not rely on the developer's absolute path. Ctrl+C stops the service created this time. When the port is occupied, it clearly fails and does not kill other processes.

Environment: Node >=24.11, npm, official Codex CLI (local verification 0.146.1). The first new directory executes `node scripts/install.mjs`, use the project lock file to install in front, app-builder and mcp-runtime respectively, and disable the dependent life cycle script; do not install the global runtime. Before starting, `setup.mjs` creates an internal token, and copy the authentication file from the local Codex login to local-secrets/codex when there is no auth in the project; do not overwrite the existing project auth or global configuration. When there is no login, log in to this project with `node scripts/login.mjs`, and then restart the service. Login credentials are not distributed with customer seeds.

The rules are subject to the in-app rules/ and AGENTS/CLAUDE, and the startup does not overwrite the source code, real data or rules. Configure in config/runtime.json; see docs/runtime.html for interface and boundary. This macOS delivery follows the main single chat starting point, see the new script; single file self-unpacking and Windows/Linux have not been implemented.

## Follow-up distribution plan

macOS clean source package packaging script scripts/package-macos.mjs has been implemented; the online torrent creator and single file entrance have not been delivered yet.
The subsequent startup entrance is responsible for locating the current application directory, reading the fixed version seed data, checking and expanding rules and entrances, initializing the new application status, preparing dependencies in this directory, selecting available ports, starting local services and opening web pages.
When running the same directory repeatedly, continue the existing application, do not overwrite the business source code, data, filled in the general ledger or rules; update the independent candidate version process.
By default, new features create modules of the same name under front/features/ and backend/features/ in existing applications; independent new applications initialize all their information in the new folder. The launcher should distinguish between two operations.

## Distribution method

When there is no cloud at present, it is recommended to take the offline seed compression package with startup entrance, seed source code, complete rules, AGENTS/CLAUDE, initialization status structure, dependency lock file and license.
When users insist on copying a single file, they can follow up to make a self-unpacking entrance with embedded seed data and rules, and the file will be larger; a very small online boot script needs a fixed version download source that can be used.
The local source code and data do not mean that Node, model or all platform dependencies have been carried; the platform, runtime preset or attached policy need to be determined before delivery. The model can use a remote adapter, and the key is available locally.
Do not embed filled-in local-secrets, real logs, sessions or developer task authorizations; macOS packages and rebuilds the recipient's target/progress/task initial record, and retains the source of the source code submission. Rules are packaged as they are and are not updated silently when starting.

## Persistent runtime control
`scripts/dev.mjs` now supervises frontend and backends using backend/runtime-manager. Public frontPort is a persistent same-origin gateway; internal Vite uses vitePort (default5174). Restart app reloads selected source; Restart backend preserves frontend. Optional services are discovered from the selected checkout. Recovery route `/__saplingagent/runtime` stays available during failure; manager/launcher/port changes require the Mac launcher. See backend/runtime-manager/CONTRACT.md and DEPLOY.md.
