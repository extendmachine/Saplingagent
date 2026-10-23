# Saplingagent Final Goal

Updated: 2026-10-19. This document defines current product positioning and how future requirements are interpreted. History and implementation/acceptance status belong in TODO.md and AI_TASKS.md; live development records are authoritative in .worktrees/coordination/ when present. Public control rules remain in rules/README.md.

## Product positioning

**Saplingagent is a minimal software seed package that users can modify themselves, directly or through conversation with AI.**

The seed gives a local project the essential ability to converse, understand its files, change its code, run it and retain context. Users decide what the application becomes. The starting experience is one web page with one chat interface; application-specific components, workflows and services grow from actual user requests.

The long-term goal is to make building and adapting personal applications practical through conversation. Broader application and platform support is a direction to develop and verify, not an existing universal capability.

## What minimal means

- Ship the capabilities needed to start, modify and operate a project, with a simple entry point and clear dependencies.
- Keep the default interface focused on conversation and necessary operation controls. Retain the current version and restart controls.
- Add business interfaces, canvases, dashboards, knowledge bases and integrations when requested. They are optional extensions, not requirements for every seed.
- Prefer small, understandable modules and mature components. Add services, dependencies or configuration layers only when the requirement needs them.
- Keep installation and delivery reproducible. A launcher relies on the accompanying seed files and declared dependencies; copying one script alone does not supply the whole application.

Minimality concerns required functionality, installation, interaction and maintenance. No package-size, memory-use or process-count guarantee has been established. Reducing those costs requires measurement and a separately scoped implementation. This positioning update does not remove existing working features.

## Essential seed capabilities

1. **Conversation and context:** usable streaming chat, persistent project sessions and user context, interruption and understandable error recovery.
2. **User-directed modification:** understand the project, edit frontend/backend code and configuration, execute development commands, and create or adjust MCP tools and Skills as needed.
3. **Local operation:** install declared dependencies and start the application. Restart app reloads frontend/backend code and newly created project/microservice processes in-page, using discovery or project-owned startup registrations. The AI creating a process integrates its startup, dependencies and readiness; users do not need a separate terminal or complete exit for ordinary feature changes.
4. **Versions and recovery:** expose current source/version information and user-selected source restoration. Keep source recovery and business-data recovery separate.
5. **Project ownership:** organize code, rules, goals, documentation, configuration, environment and local data under the application's folder, with declared external dependencies.

The current implementation uses a React web interface and local backend services connected to Codex App Server. The seed contains Agent orchestration and tool connections, rather than bundled model weights. Users configure or authenticate their own model access. Model choices and account conditions belong in configuration and installation documentation rather than the permanent product goal.

The user's existing Full Access decision remains: AI tools may modify the frontend, chat, backend, MCP, Skills, dependencies and configuration as the current OS user. There is no MCP directory allowlist, mandatory per-operation confirmation, compilation gate or automatic rollback. OS permissions and explicit project testing, Git and publication requirements continue to apply. This does not grant root privileges or change external-service authorization.

## How future requirements are interpreted

For each new request, first relate it to this positioning and identify where it belongs:

| Requirement type | Default treatment |
| --- | --- |
| Reusable capability needed to converse, modify, operate or maintain projects | Extend the common seed with the smallest sufficient change. |
| A business feature, interface preference or integration for one application | Build it as an optional project feature or service; do not automatically require it in every seed. |
| A request to create another application | Use an independent folder with its own goal, context and data; implement initialization support when requested. |
| A proposal from AI rather than a user requirement | Explain the benefit and scope before expanding the product. |

State the affected module, required dependencies and acceptance criteria before implementation. Choose the simplest design that satisfies the request and preserve existing user functionality/data. User-requested features remain valid even when optional; do not reject them merely because the seed starts small, or silently turn them into global defaults.

Distinguish explicit preferences, temporary requests and inferred habits. Adaptation proposed from long-term conversation should retain its evidence and user corrections, and be evaluated against actual use. Automatic adaptation is a goal to verify, not a completed capability to assume.

The user's current explicit instructions take priority within the project. This document guides feature placement and design; it does not create new permission, replace rules or approve implementation, branch synchronization or release by itself.

## Project and delivery boundaries

- Frontend source belongs in front/, backend services in backend/, human guides in docs/, and project Skills in .agents/skills/. services/ is an index, not a duplicate source tree. Services communicate through documented interfaces.
- Each application owns its files, context and business data. New projects receive their own goal/task records rather than inheriting the creator project's history or approval records.
- Saplingagent maintainer development modifies code only within this project folder, including its contained worktrees. A distributed seed contains all project-owned code, rules, MCP/Skills, configuration, documentation and launcher helpers in one complete folder, with no required sibling checkout, fixed developer path or external source symlink. Dependencies are installed locally; declared remote model services and operating-system tools remain external requirements.
- Recommend customer application edits stay inside their own folder by default. A customer may explicitly request external code edits using current Full Access; this advice creates no code permission restriction, path allowlist, sandbox or new per-operation approval.
- Every final conversational reply, including ordinary chat and read-only work, includes the existing eight-field completion-review receipt. Report actual modifications/checks and pending work without inventing task IDs, tests or success. Read-only conversations remain unregistered.
- Carry rules, AI entry points, dependency declarations and startup instructions with the seed. Exclude private credentials, real logs and existing conversations from default source packages; data migration/export is explicit and separate.
- A standalone install.sh bootstrap supports one-command fresh installation in macOS Terminal/Windows Git Bash: resolve release, download its fixed source snapshot into a new local folder, then invoke the existing installer/menu. Source download creates no author branch refs; installation never initializes Git or fetches branches; existing customer Git remains untouched, with unchanged Full Access. A public repository cannot hide branches from a user who explicitly visits or configures them.
- One Saplingagent.sh entry covers macOS Terminal and Windows Git Bash, with companion internal OS helpers and no standalone .ps1 launcher. Windows initial installation requires a Bash environment; daily native launching does not require an open terminal. Linux/WSL is not the native Windows install path. Installation covers macOS and native Windows 10/11 x64 and ARM64. Windows 10 Intel/AMD64 is the requested target; native Windows installation/login/restart acceptance remains pending until tested on that system. Other unsupported architectures/operating systems and device hosts require separate implementation and validation. Model services and integrations remain declared runtime dependencies.
- Keep main, adobe-replica and release as the named branches. Main is the owner’s development/testing branch; release is the public default, introduction and customer source branch. Shared changes land and are checked on main first, then proceed to a requested release promotion. An explicit main-only request leaves release untouched. Demo videos, presentation examples and showcase images live only on release; main links to that introduction and retains shared branding and necessary technical illustrations. Preserve release presentation when promoting code. The direct-main authorization remains effective after appropriate self-checks (rule04); report human acceptance separately. This maintainer policy does not transfer to recipient projects.
- User-facing installation, configuration, chat, errors and help support English and Simplified Chinese with consistent keyed language resources and a project-local preference. Existing conversations, identifiers and technical details remain unchanged. Project-owned source and accompanying documentation use MIT: commercial use, modification and distribution are permitted with the copyright/license notice and upstream repository URL retained. Third-party rights remain separate.

## Customer-local setup and launcher (0.9.3)

The explicit owner workflow is script → local minimal kernel → copy a self-contained configuration capsule from kernel to a private temporary sibling folder → configuration B while original entry A exits → save identity/icon/AI settings, stop owned project processes, rename the full folder and compile the tiny native launcher → B hands back to A at the actual project root, exits, then A deletes its verified external capsule → user opens the app. The app checks and installs missing or changed local dependencies before starting the application. Normal app launches do not recreate the configuration capsule.

On macOS, the native app remains an ordinary Dock application while the existing project services run. Reopening its icon reuses the project; normal Quit/Command-Q stops this project's owned startup and services before the app exits. Closing the browser alone does not stop them. Failed shutdown keeps the app available for retry. Configuration waits for the native app and startup helper to exit before folder moves or executable replacement. This adds lifecycle control without changing the browser UI, service cluster or Agent permissions; older exported apps require an explicit rebuild to adopt it.

Canonical management source and dependencies remain under kernel/ and in the complete project. Generated kernel/.cache/configuration contains the closed management backend and built frontend; a copied Node runtime lets the external B survive project renaming. B keeps configuration/data/authentication and build artifacts in the actual project, rebinds paths after moving, and uses an OS-assigned port. The external temporary execution and cleanup are explicitly owner-authorized. Only this project's owned services/authentication are stopped; existing destinations, unrelated processes, customer Git/data and original kernel baselines are preserved. A checks session ownership and waits for B exit before cleanup, including on Windows. Failed builds keep saved settings and the actual folder, with no automatic rollback. Native output is staged and replaced; unchanged executables are reused. The launcher remains a bootstrap for the accompanying source, not a packaged copy of business code or a global installation. Real Windows hardware/account acceptance remains separate from automated checks.

## Outside the current default scope

Do not preload a general business suite or require a canvas, domain workflow, device automation, ETT integration, cloud marketplace, hosted model service or multi-project platform in every seed. These can be separate extensions when requested.

Cloud content upload/download, additional operating-system installers, commercial signed/store native distribution and commercial authentication remain outside the current request. Plans and prototypes do not become completed or mandatory capabilities merely because a design document exists.

## Acceptance criteria

1. A recipient can install and start the complete clean seed in a new writable folder using documented macOS or Windows entry points and their own model authentication, without the developer's fixed filesystem paths or private account.
2. The initial page provides usable conversation and necessary runtime/version controls, without mandatory unrelated business components.
3. A representative user request can change the local interface or backend with a verifiable, reloadable result. The delivered project remains modifiable.
4. Context, source and business data remain organized and identifiable. Restart/source switching preserve actual data/login state according to documented behavior, without silently resending a task.
5. User-created functionality can remain application-specific. Common seed changes have a stated reuse need and avoid unnecessary default complexity.
6. Before publishing, freeze and verify the actual code, then verify that the product version declaration, owner-selected product version, promoted release commit, tag and downloaded package receipts agree; do not independently increment the owner’s selected version. Public tag correction requires explicit owner instruction and saved provenance. The installed kernel version is the only Saplingagent version; Git source revisions and publication tags must identify the checked source. Never treat a bare tag as complete publication metadata.
7. Rules, dependencies, installation and modification instructions agree with the complete-folder delivery boundary and the every-turn completion-review receipt; Full Access remains unchanged. Unsupported platforms/dependencies and unverified adaptation are clearly identified.

These criteria define the desired product. Actual implementation, automated checks, human acceptance and branch synchronization are recorded separately in the authoritative TODO.md and AI_TASKS.md.


## Git-free recipient distribution (product0.9.2)

Fresh downloads contain the release source snapshot and no Git metadata. Installation does not initialize a repository, select storage, connect remotes, fetch or merge application source. The default page has no Git branch, Save version or workspace-version controls. Users may manage their own application freely, including creating their own repository later. Reinstall and kernel maintenance never erase that repository. Maintainer main/adobe-replica/release and release-only showcases remain unchanged.

## Chat attachments and fresh page inspection (2026-10-15)

Authorized capability: select, drop or paste files/images into AI chat, retain original bytes locally with conversation metadata, and deliver native image inputs plus file references to the selected Agent. Provide fresh rendered project-page DOM/layout and optional DOM image through page_read so AI can inspect its UI changes without additional own-project or OS screen-recording permission. Preserve existing Full Access, authentication, sessions and restart behavior. Current entry participates automatically; standalone pages require the bridge. Image/model/clipboard format limitations and unavailable pages must be reported truthfully. This is a main-only development change; release presentation remains separate.

## Single complete-restart action (2026-10-15)

The main page exposes one Restart app button, with no adjacent backend-only/recovery dropdown. It always uses the existing full managed-project restart: stop owned frontend/backend/project processes, relaunch from the current source plan, await readiness and refresh the page. Keep persistent gateway/controller, busy protection, truthful failure status and conversation recovery. Diagnostic recovery HTTP access remains available for failures.

## Independently managed kernel (product0.9.2)

Kernel0.91/schema3 owns install/update, complete restart, AI configuration/engine adapters, independent control UI and its own locked dependencies. Application/chat UI, workspace/context, builder/page reading, MCP, all Skills and plugins, mixed application source/build/dependency files, demos, rules, configuration and data remain customer-owned. Full Access is unchanged. Ownership defines update scope, never AI edit permission.

The page offers Check for kernel update and Upgrade kernel & restart. Resolve official release to an immutable commit, stage and verify owned bytes, review conflicts, drain app tasks, copy a temporary maintenance worker, stop owned app processes, back up/apply only core, repair only core dependencies and restart all application services. The worker survives controller shutdown and shows actual progress/failures, manual source restore and retry. It returns to the selected live port after verified readiness; source success does not imply model/account readiness. No automatic rollback or Git merge. Application frontend and dependency manifests are preserved.

Schema3 deliberately refuses older broad/schema2 baselines, plans and backup manifests; old updaters also reject3 before interpreting released files as deletions. Existing0.9.1 prototype installations require a deliberate complete-tooling transition in a new folder or manual reconciliation preserving application/data. Never regenerate a customer baseline to hide core edits. The current installed kernel version is the single Saplingagent version.

## Contained platform implementation (2026-10-19)

All kernel implementations, default device settings, internal commands, service contracts,
engine adapters, native launcher sources and the complete setup website live in `kernel/`.
The setup React source is `kernel/ui/setup/`; its generated assets are
`kernel/.cache/setup/`. Runtime management and AI configuration live in
`kernel/services/`, provider adapters in `kernel/engines/`, and installation/build
commands in `kernel/scripts/`. `kernel/config/` contains device defaults; customer
configuration remains under root `config/` and credentials under `local-secrets/`.

Ordinary application development should change `front/`, `backend/`, application
contracts and `config/services.json`, using public kernel interfaces. Do not edit
kernel internals to add a business feature. Explicit platform-maintenance requests
can still modify the kernel with current-user Full Access: this is organization and
update guidance, not a permission restriction or path lock.

The public root Bash entries and a finite set of old import/command paths remain
small forwarding adapters and two Node-version metadata files for existing native launchers only. They contain no platform implementation or setup
page. `kernel/compat/paths.mjs` enumerates these compatibility entries, necessary so
existing applications and the shipped0.9.2 updater keep working. New code uses
canonical kernel paths. The schema3 manifest adds `layoutVersion:1`, restricts
current ownership to `kernel/` plus those entries, and keeps historical validation
for deliberate migration/recovery. Unmodified old schema3 installations can migrate;
local core edits still cause conflicts and need a deliberate merge. Never regenerate
a customer's baseline to hide them. A contained install cannot update back to the
old distributed layout; restoring an explicit backup remains available.

## One kernel version (2026-10-19)

The current version is **kernel0.9.6**. There is no separate product version. kernel/manifest.json is authoritative for display, setup, installation, maintenance and packaging. Old API/receipt field names can remain compatibility aliases, but they must not establish a second current version. Missing metadata is unavailable, not a hardcoded historical baseline. Keep old version records/backups factual and handle their numeric migration deliberately without hiding local edits. See contracts/release.md and docs/kernel-version-migration.html.


Owner storage clarification (2026-10-19): configuration execution uses a visible
`../sapling-config-*` directory beside the project. Persistent project configuration,
credentials, dependencies, caches and output remain under the actual project; all
managed destinations derive from this relative layout, with no hardcoded system
temporary or user-home write location. Internal absolute OS identity checks and
explicit read-only account imports remain valid. Existing customer Agent Full
Access is unchanged. Locks must cover concurrent setup, install, rename, compilation
and cleanup without retaining project handles across rename or deleting live or
unrelated helper directories.
