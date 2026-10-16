# Saplingagent Final Goal

Updated: 2026-10-15. This document defines current product positioning and how future requirements are interpreted. History and implementation/acceptance status belong in TODO.md and AI_TASKS.md; live development records are authoritative in .worktrees/coordination/ when present. Public control rules remain in rules/README.md.

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
- A standalone install.sh bootstrap supports one-command fresh installation in macOS Terminal/Windows Git Bash: resolve release, download its fixed source snapshot into a new local folder, then invoke the existing installer/menu. Source download creates no author branch refs; follow mode narrows ordinary fetches to the selected release branch and skips tags. Local/own history and explicit branch choices remain customer-controlled, with unchanged Full Access. A public repository cannot hide branches from a user who explicitly visits or configures them.
- One Saplingagent.sh entry covers macOS Terminal and Windows Git Bash, with companion internal OS helpers and no standalone .ps1 launcher. Windows requires a Bash environment; Linux/WSL is not the native Windows install path. Installation covers macOS and native Windows 10/11 x64 and ARM64. Windows 10 Intel/AMD64 is the requested target; native Windows installation/login/restart acceptance remains pending until tested on that system. Other unsupported architectures/operating systems, native apps and device hosts require separate implementation and validation. Model services and integrations remain declared runtime dependencies.
- Keep main, adobe-replica and release as the named branches. Main is the owner’s development/testing branch; release is the public default, introduction and customer source branch. Shared changes land and are checked on main first, then proceed to a requested release promotion. An explicit main-only request leaves release untouched. Demo videos, presentation examples and showcase images live only on release; main links to that introduction and retains shared branding and necessary technical illustrations. Preserve release presentation when promoting code. The direct-main authorization remains effective after appropriate self-checks (rule04); report human acceptance separately. This maintainer policy does not transfer to recipient projects.
- Project-owned documentation and UI are English unless explicitly requested otherwise. Project-owned source uses PolyForm Noncommercial 1.0.0; commercial permission and third-party service rights remain separate.

## Outside the current default scope

Do not preload a general business suite or require a canvas, domain workflow, device automation, ETT integration, cloud marketplace, hosted model service or multi-project platform in every seed. These can be separate extensions when requested.

Cloud content upload/download, additional operating-system installers, native app distribution and commercial authentication remain outside the current request. Plans and prototypes do not become completed or mandatory capabilities merely because a design document exists.

## Acceptance criteria

1. A recipient can install and start the complete clean seed in a new writable folder using documented macOS or Windows entry points and their own model authentication, without the developer's fixed filesystem paths or private account.
2. The initial page provides usable conversation and necessary runtime/version controls, without mandatory unrelated business components.
3. A representative user request can change the local interface or backend with a verifiable, reloadable result. The delivered project remains modifiable.
4. Context, source and business data remain organized and identifiable. Restart/source switching preserve actual data/login state according to documented behavior, without silently resending a task.
5. User-created functionality can remain application-specific. Common seed changes have a stated reuse need and avoid unnecessary default complexity.
6. Rules, dependencies, installation and modification instructions agree with the complete-folder delivery boundary and the every-turn completion-review receipt; Full Access remains unchanged. Unsupported platforms/dependencies and unverified adaptation are clearly identified.

These criteria define the desired product. Actual implementation, automated checks, human acceptance and branch synchronization are recorded separately in the authoritative TODO.md and AI_TASKS.md.


## Customer Git ownership and release defaults (2026-10-12)

Customer source downloads/packaging default to release unless explicitly configured; maintainer main remains the shared reviewed development baseline. First installation asks for local-only Git history, the customer's existing remote repository, or following the author's upstream/release. These are the only three menu choices, with an explicit numbered choice required (Enter has no destructive default). Local-only clears all previous root Git metadata and initializes empty main with zero commits and no remote links. It preserves application file contents, including pending source/data/credentials; previous Git history, branches/tags, index, aliases and configuration are removed. The launcher explains this before reset. Version reads show main and empty history; only an explicit later Save version creates a commit. Own-remote mode explicitly connects or updates origin to the supplied URL. Own/follow branch configuration follows the chosen mode; local reset always starts main regardless of delivery/branch defaults. Saved-mode reinstall does not reset later customer history. Legacy saved keep-existing choices remain compatible on reinstall. The choice is local and retained across reinstall/repair; explicit user-selected branches/versions remain valid. Installation configures/fetches only as chosen and never automatically pulls, pushes, creates a repository on a hosting service or submits a PR. Source updates remain deliberate merges with customer changes preserved. Actual UI branch names come from this application's own Git repository, never a parent folder or cosmetic relabeling. Git configuration is not an Agent permission restriction.

## Chat attachments and fresh page inspection (2026-10-15)

Authorized capability: select, drop or paste files/images into AI chat, retain original bytes locally with conversation metadata, and deliver native image inputs plus file references to the selected Agent. Provide fresh rendered project-page DOM/layout and optional DOM image through page_read so AI can inspect its UI changes without additional own-project or OS screen-recording permission. Preserve existing Full Access, authentication, sessions and restart behavior. Current entry participates automatically; standalone pages require the bridge. Image/model/clipboard format limitations and unavailable pages must be reported truthfully. This is a main-only development change; release presentation remains separate.
