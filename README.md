<h1 align="center">Saplingagent</h1>

<p align="center">
  <img src="assets/brand/saplingagent-growth-logo.png" alt="Saplingagent — a technology sapling growing into a tree" width="320">
</p>

<h3 align="center">From a conversation to your own application.</h3>

<p align="center">
  A local workspace for building and evolving software with AI.<br>
  Start with one chat. Shape the interface, add capabilities, and keep the code in your own project.
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="#demo"><strong>▶ English demo · 1:41</strong></a> &nbsp;·&nbsp;
  <a href="#install-configure-start">Get started</a> &nbsp;·&nbsp;
  <a href="docs/index.html">Documentation</a>
</p>

<p align="center"><sub>macOS 13.5+ · Windows 10/11 x64 & ARM64 · Source available for noncommercial use</sub></p>

**Saplingagent · Kernel 0.9.5 · Contained kernel layout.** Use the release-branch download or one-line installer below for this source version. See [project setup and local compilation](docs/project-launcher.html).

<a id="demo"></a>

https://github.com/user-attachments/assets/6f43f15f-38c4-4650-9383-669caa635dc8

<p align="center"><sub>English narration and captions · 1:41 · <a href="https://github.com/extendmachine/Saplingagent/releases/download/demo-2026-10-14/Saplingagent-English-Demo-Final.mp4">Download the high-quality original</a></sub></p>

---

- **Build through conversation.** Turn requests into React interfaces and local application features.
- **Keep your project local.** Code, conversations and version history stay with your application.
- **Extend as you grow.** Connect Codex, OpenCode or Claude Agent with MCP tools and reusable Skills.

See a request become a working clock, then a saved version. English narration and captions · 1:41.

<a id="document-workspace"></a>

## Case study · A WPS-style local document workspace

From one chat page to a document workspace. Browse files, make basic Office edits, work with PDFs and keep AI conversation alongside your documents.

This is an example application built with Saplingagent. The default installation starts with the minimal chat interface.

![File tree, spreadsheet and AI conversation in one workspace](assets/cases/document-workspace/workspace-overview.jpg)

| Module | What the example does |
| --- | --- |
| File browsing and management | Browse a folder tree, filter file names, refresh listings, create files and folders, and copy absolute paths. |
| Word documents | Preview DOCX, edit paragraph text directly, and adjust paragraph-wide font, size, emphasis, color and alignment. |
| Spreadsheets | Open Excel, CSV and ODS files, switch worksheets, and edit cell values or formula text. |
| PowerPoint | View PPTX slides and edit their text through a structured panel. |
| PDF reading and editing | Navigate and zoom, add or replace text, fill text form fields, rotate or reorder pages, and delete pages. |
| Local OCR | Recognize English or Simplified Chinese on a page, then select the recognized text for editing. |
| PDF graphics | Replace, crop and adjust image objects; change vector geometry, color and paths. |
| Markdown and code | Switch between Markdown editing and preview, and edit common code, configuration and text files. |
| Images and media | Preview images and play audio or video files. |
| Save and restore | Check for external file changes before saving, flag unsaved work, and restore the version before the last save. |

**Word editing** — work directly on rendered paragraphs with a formatting toolbar.

![Word document with direct paragraph editing and formatting controls](assets/cases/document-workspace/word-editor.jpg)

**PDF and OCR** — local Simplified Chinese OCR with a recognized line selected in the text editor.

![PDF page with local Chinese OCR and its text editing panel](assets/cases/document-workspace/pdf-ocr-editor.jpg)

<details>
<summary>Editing scope</summary>

Office editing covers basic changes. Word controls format whole paragraphs; PowerPoint edits text rather than objects or animations. The spreadsheet view shows the first 250 rows and 60 columns; formula text can be edited, but no formula calculation engine is provided. PDF replacement can change typography or affect overlapping objects. The file panel currently covers browsing and creation; rename, move and recycle-bin workflows are not implemented.

</details>

<details>
<summary>Explore the full guide</summary>


- [Install, configure, start](#install-configure-start)
- [Application folder and kernel](#your-application-folder-without-git-setup)
- [Switch versions and restart](#switch-versions-and-restart)
- [Update or repair an existing installation](#what-menu-1-updates)
- [Authentication and costs](#authentication-and-costs)
- [Models, permissions and configuration](#models-permissions-and-configuration)
- [Troubleshooting](#troubleshooting)
- [Application structure](#application-structure)
- [Branches and source delivery](#branches-and-release-preparation)
- [License](#license)

</details>

## Configure and launch

The right-hand chat supports saved-conversation switching and renaming, per-conversation drafts, attachments, GFM tables and math formulas. Collapse the panel and drag its small chat opener to a convenient position. The context gauge shows the latest token count and window reported by Codex; unavailable readings stay unknown. It is not a billing meter or a promise of automatic context compaction. These controls belong to the editable application, independently of kernel updates.

Run `bash Saplingagent.sh`. The script installs the minimal local kernel and opens configuration in a temporary process outside the project. Save the project name, folder, icon and AI connection, then choose **Save & build app**. Wait for completion and choose **Finish setup**. The returning launcher removes the external configuration files after that process exits.

Open the generated `.app` or `.exe` inside the complete project folder. It checks and installs missing/changed project dependencies, displays startup progress, then opens the **Project status** page at the runtime's actual selected address. This page shows your project, kernel version, service processes and ports; choose **Open app** to enter the application. It stays a small bootstrap; your editable source and data remain in the folder. Reopen `bash Saplingagent.sh configure` to change settings or rebuild the launcher. Normal app startup does not reopen configuration. See the [project status guide](docs/project-status.html) and [A/B lifecycle and recovery guide](docs/project-launcher.html).

On macOS, the app stays in the Dock while the existing project services run. Click its Dock icon to reopen project status; choose **Quit** or press **Command-Q** to stop this project's backend and exit. On both systems, **Stop app** on the status page waits for owned application services to exit before confirming; reopening the compiled app starts them again. Closing the browser or hiding startup progress leaves services running. A disconnected page is not proof of shutdown. If shutdown fails, inspect `logs/project-launcher/` and retry. Configuration waits for the native app and startup helper to exit before renaming or replacing the launcher. After updating an existing installation, use **Save & build app** once to rebuild an older exported `.app`/`.exe` with the new progress display. Application source and the service cluster remain unchanged.

## Install, configure, start

### 1. Get the complete application

For a new installation, run one command in **macOS Terminal** or **Windows Git Bash** (install [Git for Windows](https://gitforwindows.org/) first):

```bash
bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/extendmachine/Saplingagent/release/install.sh | bash'
```

The independent `install.sh` resolves the current **release** commit, downloads that exact source snapshot into `./Saplingagent`, installs the local kernel, then opens web project setup. It does not clone all repository branches or require Node before downloading. No Git repository is initialized or connected. Save the project name, icon and target folder first, then configure AI. Save & build app applies the folder name and compiles the native launcher from the independent external configuration process. Finish setup closes that process and lets the project launcher remove its temporary folder.

The target folder must be new; existing applications are preserved. Add `--dir` and `--lang` for a different destination/language:

```bash
bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/extendmachine/Saplingagent/release/install.sh | bash -s -- --dir "./My Saplingagent" --lang zh'
```

Use `--download-only` to fetch source without installing or opening a menu; then run `bash Saplingagent.sh` inside the downloaded folder. First Install initializes recipient goal/task records; edits made before installation are preserved with a warning. The script needs HTTPS access to GitHub API/archive endpoints and standard curl/tar/SHA256 tools (macOS and Git Bash supply them). API/rate-limit/download failures are reported; retry in a new folder if a completed source folder already exists. All dependencies and configuration install locally. This command is for fresh installation, not automatic source updates.

Only release is downloaded, without Git metadata or author branch refs. Existing customer Git is preserved, and users can independently create their own repository. The public repository remains manually accessible; this is a default delivery workflow, not a permission restriction.

Alternatively get the complete application folder manually:

```bash
git clone --single-branch --branch release --no-tags https://github.com/extendmachine/Saplingagent.git
cd Saplingagent
```

Or [download release source](https://github.com/extendmachine/Saplingagent/archive/refs/heads/release.zip) and extract it. Customer downloads use `release`; choose another branch explicitly if needed. A private repository requires access.

### 2. Install through the launcher

Use the same **Saplingagent.sh** entry from the application folder on both platforms:

- **macOS:** open Terminal in the complete project folder.
- **Windows10/11 x64 or ARM64:** install/use [Git for Windows](https://gitforwindows.org/), then open **Git Bash** in the complete project folder. Windows CMD/PowerShell do not run Bash scripts directly. Git Bash is required; WSL/Linux is not this native Windows installation path.

```bash
bash Saplingagent.sh
```

Choose **English** or **中文** (Enter defaults to English). The script installs only the management kernel and opens the configuration webpage. For Chinese directly, use `bash Saplingagent.sh --lang zh`.

1. Edit the project name, desired folder name and optional icon, then **Save project settings**. This saves your choices without moving the running folder.
2. Save and select your AI account/API scheme. Complete your changes before the final save; configuration does not send a model prompt.
3. Click **Save & build app**, then wait. Configuration B already runs outside the project. It closes owned authentication and application processes, moves the complete folder without replacing a destination, rebinds saved paths and compiles the named `.app` or `.exe` into that folder. Customer Git, credentials and conversation files are preserved; development worktrees stay in place.
4. Choose **Finish setup**. B starts A at the final path, receives its acknowledgement and exits. A waits for B to release its files, then removes the verified external capsule. The page confirms the handoff; `.runtime/configuration-complete.json` records actual cleanup.
5. Double-click the app. It checks Node and declared dependencies, installs missing or changed groups locally, starts the project and opens its actual URL. Reopen `bash Saplingagent.sh configure` to change settings or rebuild. Unchanged native executables are reused; new builds replace the previous output after validation.

Keep the complete folder. Source, local runtimes, compiler and data remain inside it. Renaming the customer project does not change Saplingagent's kernel identity. Native Windows icon/folder replacement still requires real-device acceptance; local Mac compilation is not Developer ID notarization. See the [launcher guide](docs/project-launcher.html).

Explicit fallback commands remain: `bash Saplingagent.sh configure --no-open`, `install --repair`, `start`, `doctor`, and `kernel`. `SAPLING_LEGACY_MENU=1 bash Saplingagent.sh` opens the previous terminal menu. Script installation opens web setup; it does not initialize or erase customer Git.

Installation supports macOS 13.5+ on Apple Silicon or Intel, downloads official Node **24.21.0**, checks its official SHA-256 checksum, and installs project-local Codex **0.146.1**, OpenCode, Claude Agent SDK **0.3.296** and locked dependencies. No preinstalled Node, npm, Homebrew or Codex desktop app is required. Git is required for local version history; on Mac, install Apple Command Line Tools with `xcode-select --install` if Git is missing (full Xcode is unnecessary); Windows requires Git Bash and its bundled shell utilities. Windows10 must be version1809+; ARM64 and x64 are detected automatically. Internet access to official downloads, npm and your model provider is required. Versions are declared in [kernel/config/macos.json](kernel/config/macos.json) and dependency lockfiles.

Runtimes stay in `.runtime/`, dependencies in their modules' `node_modules/`, and npm cache in `.cache/npm/`. No sudo or global npm installation is needed. Keep the entire application folder; the single user-facing launcher uses its internal scripts and configuration.

### 3. Configure AI and start your first conversation

**Configure AI** opens a separate local web page after installation, before the chat services are started. The page has English/Chinese controls:

- **ChatGPT account:** open the official Codex sign-in page, or use a device code. On completion the account becomes the default scheme. Existing project-local ChatGPT credentials can be selected without signing in again.
- **API / custom provider:** name a scheme, select Codex, OpenCode or Claude Agent, choose the API protocol, enter the provider's **API Base URL**, API key and exact model ID, then **Save & use**. Use the API URL rather than a website homepage. Codex custom endpoints require Responses; Claude Agent requires Anthropic Messages with an API scheme; OpenCode supports Chat Completions, Responses and Anthropic Messages. Presets help fill OpenAI, OpenRouter, Anthropic and local Ollama-compatible endpoints. Providers requiring other protocols, arbitrary headers or separate subscription OAuth need their own adapter.
- **Fetch models** is optional and performs a catalog GET only. If discovery is unavailable, enter the model ID manually. Use a model with streaming/tool-calling support for application development; saving a scheme does not validate compatibility or quota.
- Keep multiple schemes and select **Use** to change the default. Choose **Save & build app**, wait for completion and then **Finish setup**. Open the generated native entry; **Stop app** stops owned application services. Closing a browser tab does not stop the service. If browser opening fails, use the loopback URL printed in the terminal.

Scheme metadata stays in `local-secrets/ai-config/connections.json`, API keys in `local-secrets/api-keys/`, and Codex sign-in credentials in `local-secrets/codex/`. The credential ledger stores file references. The page never reads saved keys back into fields; leave a key blank when editing to retain it. No global credentials are imported. OpenCode's legacy native provider selector remains available as an explicit recovery command and stores its credentials in `local-secrets/opencode/`.

Startup uses the saved default scheme. **An OpenCode-only or custom Codex API scheme does not require ChatGPT login.** Reconfigure while an app is running, then restart and start a new conversation to apply the choice. Existing conversations retain their engine/model; do not resume a Codex thread through a different provider. See [AI configuration guide](docs/ai-configuration.html) and [configuration service contract](kernel/services/ai-config/CONTRACT.md).

Startup opens the **actual address printed in the terminal** after local readiness checks. Port5173 is the default starting point; occupied public/internal ports are skipped upward. Send a message to verify an actual response. Installation and saved login do not prove model access or available quota.

### Command-line actions

For automation or recovery, the same launcher accepts explicit actions:

```bash
bash Saplingagent.sh install --repair
bash Saplingagent.sh configure
bash Saplingagent.sh configure --no-open
bash Saplingagent.sh login --device-auth
bash Saplingagent.sh opencode
bash Saplingagent.sh start --no-open
bash Saplingagent.sh doctor
bash Saplingagent.sh git
bash Saplingagent.sh kernel
bash Saplingagent.sh logout
```

Device login depends on account/organization eligibility. Use `bash Saplingagent.sh` from Terminal; no executable-bit change is required for this command. `./Saplingagent.sh` also works when the executable bit is retained. Use Bash rather than `sh`: the script uses Bash syntax.

## Your application folder, without Git setup

The Git-free delivery workflow downloads the release snapshot without `.git`. Installation does not initialize Git, ask for storage or connect an author remote. The default page has no branch, Save version or workspace Git controls. You can create your own repository later; reinstall and kernel maintenance preserve it.

## Upgrade the kernel and restart

Open **Kernel → Check for kernel update → Upgrade kernel & restart**. Review the verified release SHA, paths and conflicts, then accept the compatibility warning. A copied temporary progress process stops owned services, backs up/applies core, repairs its own dependencies and restarts the complete application at its actual selected port. App/chat pages, MCP, Skills, demos, business code, application dependency manifests, configuration, data and customer Git are retained. Restart app/backend remains available without an upgrade. Recovery is explicit; no automatic rollback. Direct control: `/__saplingagent/kernel`.

This source declares **Kernel0.9.5 / schema3 / layout1**, the single Saplingagent version. Release promotion is separate from main development; inspect the committed release metadata before downloading. The0.9.1/schema2 prototype requires a deliberate complete-tooling transition: download0.9.2 into a new folder, retain your original folder and reconcile your own app/data/config. Do not blindly overwrite credentials or regenerate an old baseline. Future compatible schema3 kernels upgrade from the web control. [Kernel management](docs/kernel-management.html) documents failures, retry and manual source recovery.

## Import existing local credentials

Open **Configure AI → ChatGPT account**, then choose **Use local Codex login** or **Upload auth.json**. File-based local login is read from the caller's `CODEX_HOME`, otherwise `~/.codex/auth.json` (Windows: `%USERPROFILE%\.codex\auth.json`). The selected login is copied into this application’s `local-secrets/codex/auth.json` and activated. Keychain-only or desktop-only login may have no reusable file; use the existing official sign-in buttons in that case. An existing project account is preserved unless **Replace existing credentials** is explicitly selected. No global login/config is changed.

For Claude choose **Claude API**, enter your provider URL/model and use **Import local Claude API credentials** or **Upload API credential JSON**. The local action reads `ANTHROPIC_API_KEY` inherited from the launcher terminal, or the API env fields in local Claude `settings.json` (`CLAUDE_CONFIG_DIR` or `~/.claude`). JSON accepts `apiKey`, `ANTHROPIC_API_KEY` or `env.ANTHROPIC_API_KEY`, with optional `baseUrl`/`model`; nonblank form fields take precedence. Existing scheme keys require explicit replacement. Claude subscription OAuth files, OS keychain and executable credential helpers are not imported.

Files are limited to32KiB and sent only to the protected local configuration service. Secrets stay in ignored project files, never state responses or browser storage. Import validates local structure/storage, not token expiry, quota or successful model access. Save settings, build the app and finish setup; start a new conversation when changing providers. See the [configuration guide](docs/ai-configuration.html) and [Claude official API authentication](https://code.claude.com/docs/en/agent-sdk/quickstart).

## Authentication and costs

**The local App Server does not charge a separate server fee. Model usage requires your own authentication and available quota.** Saplingagent includes no developer account, shared API key or promise of free model access.

| Route | Authentication and billing |
| --- | --- |
| ChatGPT account scheme | Your own ChatGPT login through official Codex; access and limits depend on the account's plan, organization and model eligibility |
| API scheme (Codex / OpenCode / Claude Agent) | Your own provider credential and API endpoint; usage follows the provider's billing and eligibility, separate from a ChatGPT subscription. Supported protocols are selected in the setup page |

Installation, saved authentication and `model/list` discovery are separate from successful inference. Start/Doctor do not send a model prompt automatically. Sending a chat message initiates model usage. Reinstallation does not increase quota.

For current eligibility and costs, consult [Codex authentication](https://learn.chatgpt.com/docs/auth) and [Codex pricing and usage limits](https://learn.chatgpt.com/docs/pricing); no plan price or free-tier entitlement is hard-coded here.

**Commercial and hosted authentication:** the current implementation uses local Codex login. OpenAI documents continuation for existing local or open-source applications and recommends migration to Sign in with ChatGPT. App Server authentication has never been permitted for commercial or hosted services. This project has not completed commercial Sign in with ChatGPT registration/integration. A separate Saplingagent commercial license does not grant OpenAI authentication rights. Before commercial distribution, resolve both permissions. See [App Server authentication](https://learn.chatgpt.com/docs/app-server) and [Sign in with ChatGPT integration](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server).

## Optional OpenCode providers

Codex is the initial default when no scheme is saved. Use **Configure AI → API / custom provider** for OpenCode with an Anthropic, OpenRouter or custom compatible endpoint; that saved scheme can be the startup default. For providers requiring the native selector instead, run `bash Saplingagent.sh opencode` as a terminal fallback. Its credentials stay under `local-secrets/opencode/`. Restart Saplingagent and choose a connected OpenCode provider/model before the first message of a new conversation. Each conversation stays bound to its original engine/model across refresh and restart; start a new conversation to switch. There is no automatic fallback between providers.

Claude can also run through the official **Claude Agent SDK** as its own local agent engine. It embeds the Claude Code agent loop with native shell/file tools, MCP, project Skills, streaming and resumable sessions. This is an embedded SDK integration, with no separate public App Server port.

Run `bash Saplingagent.sh` to open web setup, then choose **API / custom provider** → **Anthropic · Messages**. The preset selects **Claude Agent**. Enter your own API key, exact model ID and API Base URL (`https://api.anthropic.com/v1`, or your compatible gateway URL). **Save & use** → **Save & build app** → wait for completion → **Finish setup** → open the generated app. Create a new conversation when changing providers. Model discovery is optional; gateways must support Anthropic Messages streaming and tool calls. Claude schemes do not require Codex login.

The SDK is pinned to `0.3.296` and installs its native binary inside the application folder; a separate global Claude Code installation is unnecessary. API keys stay in `local-secrets/api-keys/`, and SDK state/transcripts in `local-secrets/claude/`. Project `CLAUDE.md` imports `AGENTS.md`; `.agents/` loads the existing Skills as the `saplingagent` local plugin. Full Access remains enabled as the current OS user. There is no default whole-turn deadline, automatic fallback, automatic resend or silent replacement of missing sessions.

Claude API usage uses the customer's own account and provider billing. This application does not import or offer claude.ai subscription login: Anthropic's SDK documentation requires prior approval for third-party products offering that authentication. SDK components follow Anthropic's terms, separately from this project's license. See [SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) and [quickstart / authentication](https://code.claude.com/docs/en/agent-sdk/quickstart).

Local startup proves native initialization, project MCP and Skills availability; a saved key is not a quota or inference check. Native question dialogs/MCP elicitation forms are not rendered for Claude; the agent is instructed to ask questions in ordinary chat. Windows native install, paid-provider calls and third-party gateway compatibility still require recipient testing. OpenCode's Anthropic provider remains available independently; Claude Desktop is not used as an inference backend.

## How Codex App Server connects

The installer and launcher perform the integration. Users do not need to add an MCP server to the Codex desktop app or operate a remote server.

```mermaid
flowchart LR
    UI[React chat page] <-->|HTTP / SSE| Agent[agent-runtime]
    Agent <-->|JSON-RPC / stdio| Codex[Codex App Server]
    Codex <-->|MCP / stdio| MCP[Saplingagent MCP]
    MCP --> Builder[app-builder: files and commands]
    MCP --> Workspace[workspace: sessions and preferences]
    Codex --> Skills[Project Skills and rules]
```

1. [kernel/scripts/macos/codex.sh](kernel/scripts/macos/codex.sh) selects project-local Node and Codex, sets project `CODEX_HOME`, and uses file credential storage.
2. [kernel/engines/rpc.mjs](kernel/engines/rpc.mjs) launches `codex app-server --listen stdio://` and exchanges newline-delimited JSON through stdin/stdout.
3. [server.mjs](backend/agent-runtime/server.mjs) sends `initialize`, then `initialized`; checks `account/read` and `model/list`; creates/resumes threads; starts turns; and forwards incremental text/tool events to the browser through SSE.
4. Startup arguments configure `mcp_servers.seedagent` to launch [the project MCP server](backend/mcp-runtime/server.mjs) with local service endpoints. It exposes **15 tools** for project context, files, commands, change records, preferences and Skills.
5. Codex discovers `seed-page-edit`, `seed-research` and `seed-skill-author` under [.agents/skills/](.agents/skills/). The AI enters project rules through `AGENTS.md → rules/README.md`.

The integration does not replace global Codex configuration. Existing `seedagent`, `SEED_*`, `SEEDAGENT_*` and `seed-*` identifiers remain for protocol/data compatibility.

For protocol debugging after installation:

```bash
bash kernel/scripts/macos/codex.sh --version
bash kernel/scripts/macos/codex.sh login status
bash kernel/scripts/macos/codex.sh app-server --listen stdio://
```

The last command waits for JSON-RPC input. Send the first line, wait for its successful response, then send the remaining lines:

```jsonl
{"id":1,"method":"initialize","params":{"clientInfo":{"name":"seedagent","title":"Saplingagent","version":"0.1.0"},"capabilities":{"experimentalApi":true}}}
{"method":"initialized","params":{}}
{"id":2,"method":"account/read","params":{"refreshToken":false}}
```

This debugging process does not include the project MCP startup arguments assembled by agent-runtime. Use the normal launcher for the complete application. Protocol reference: [official App Server documentation](https://learn.chatgpt.com/docs/app-server).

## Models, permissions and configuration

Public settings live in [config/runtime.json](config/runtime.json).

| Setting | Default | Behavior |
| --- | --- | --- |
| Preferred model | `gpt-6.1-sol` | Uses the actual App Server catalog; falls back to its default/first model if unavailable |
| Reasoning effort | `medium` | Must be supported by the selected model |
| Gateway / Vite / Manager / Agent / Workspace / Builder ports | `5173` / `5174` / `4314` / `4310` / `4311` / `4312` | Starting values; the launcher selects free, distinct loopback ports. PDF starts at `4313` only when source exists; Agent-owned OpenCode starts at `4315` |
| Permission mode | `full-access` | Codex `danger-full-access`, `approvalPolicy: never`; Claude `bypassPermissions` with sandbox disabled |
| Total turn deadline | `turnTimeoutMs: 0` | Disabled by default; explicit nonzero configuration enables a total deadline |
| Inactivity reminder | `turnIdleWarningMs: 600000` | Warns after 10 minutes without effective progress; does not stop or resend the turn |

The UI/status shows the **actual selected model**. A catalog entry is not proof of account entitlement. Tool commands have a separate timeout, normally 60 seconds and explicitly configurable up to one hour.

Full Access allows native/MCP file and shell operations wherever the current OS user has permission, including frontend, backend, MCP, Skills and rules. It does not elevate to root or bypass OS permissions. There is no Saplingagent directory allowlist, compulsory build/hash gate or automatic rollback. Recorded originals may support user-requested restoration; arbitrary commands and native writes are not guaranteed reversible.

Frontend edits use Vite hot reload. Restart after backend, MCP, Skill-discovery or dependency changes so the running processes load the new code.

## Troubleshooting

Choose Diagnostics in the menu, or run:

```bash
bash Saplingagent.sh doctor
bash Saplingagent.sh git
bash Saplingagent.sh kernel
```

Doctor reports installation, versions, saved AI configuration and configured-port status without displaying credentials or issuing model prompts.

| Symptom | Action |
| --- | --- |
| Finder opens the script in an editor | Open Terminal and run `bash Saplingagent.sh` from the project folder |
| Missing login | Run `bash Saplingagent.sh login` and finish your own login |
| Expired login or account change | Run `bash Saplingagent.sh logout`, then log in again |
| Download/dependency failure | Check Node.js/npm network access; run `bash Saplingagent.sh install --repair` |
| Installation lock remains | Confirm this project's installer has exited; remove only its stale `.runtime/node-install.lock` or `.runtime/macos-install.lock`, then retry |
| Windows operation exits 150 before device detection | Update the complete source folder; menu actions now retain foreground terminal ownership and interactive install/Git setup use a foreground native console bridge when available. Retry `bash Saplingagent.sh --lang zh install` in Git Bash and retain preceding error text if it still fails; the exit number alone is not a diagnosis |
| Port occupied | Follow the actual URL printed by the launcher; it selects free ports automatically. If another process wins a bind race during startup, run Start app again. Other projects are left running |
| Not ready within 120 seconds | Run Doctor and inspect the startup terminal and metadata in `logs/<service>/` |
| Local service connection failed | Keep the startup terminal running, run Diagnostics, and use the actual runtime address/ports from `.runtime/runtime-address.json`; configured ports are starting values |
| Session does not exist | The UI retains unsent/retry input and starts a new session; do not delete `data/` to resolve it |
| No recent progress | Check whether a tool or user decision is pending; continue waiting or stop manually. The reminder does not impose a default turn deadline |
| OpenCode shows `Current permissions: full-access` or internal instructions as a reply | Update source to a version containing the OpenCode message-attribution fix (TASK-20261012-017), then restart the backend/app and create a new conversation. Preserve `data/` and `local-secrets/`; older saved bubbles are not deleted. In follow mode Install / repair dependencies checks source and dependencies; local/own modes retain source. Check the actual branch/version because release may lag main |
| Quota/model authorization error | Check the actual account error and official usage limits; reinstalling cannot grant model access |

Stop services before moving the application. Move the whole folder. On the same architecture, launchers resolve the new location; reinstall after changing architecture or lockfiles.

## Application structure

```text
Saplingagent/
├── README.md / README.zh-CN.md # English / Chinese project guides
├── Saplingagent.sh             # macOS / Windows English / Chinese menu
├── front/                     # React chat and application features
├── backend/
│   ├── agent-runtime/         # Agent engines, turns, SSE, Git API
│   ├── ai-config/             # Standalone account / API configuration
│   ├── runtime-manager/       # Runtime gateway and restart controls
│   ├── workspace/             # Local sessions, preferences and evidence
│   ├── app-builder/           # File/command tools and optional restoration
│   └── mcp-runtime/           # MCP stdio tools
├── .agents/skills/            # Project workflows
├── contracts/                 # Public service contracts
├── config/ / scripts/         # Configuration, install, run and packaging
├── rules/ / docs/             # AI rules and human HTML guides
├── LICENSE / NOTICE / THIRD_PARTY_NOTICES.md
├── local-secrets/             # Private credentials; ignored by Git
├── .runtime/                  # Local Node/Codex; ignored by Git
├── data/ / snapshots/ / logs/  # Private local runtime content; ignored by Git
└── AGENTS.md / FINAL_GOAL.md / TODO.md / AI_TASKS.md
```

Fresh ZIPs have no Git metadata. Installation does not initialize Git, connect remotes or merge source. Optional legacy Git modules remain freely editable application code; the default page does not mount them. Customer-created repositories and application files are preserved by reinstall and kernel maintenance.

AI development starts with [AGENTS.md](AGENTS.md) and [rules/README.md](rules/README.md). Services maintain `SERVICE.md`, `CONTRACT.md`, `DEPLOY.md` and `REFERENCES.md`. Technical paths and protocol identifiers retain compatibility; existing user conversations are never translated by this release.

### Project ownership

Keep the complete application folder together: it contains the source, rules, Skills, configuration and launcher helpers. Dependencies install locally; model services remain external. Full Access uses your current OS permissions. Ordinary edits stay within the project; an explicit request can target other accessible code. The bundled rules require an eight-field completion receipt, including for read-only replies; actual model compliance still needs conversation validation.

## Branches and release preparation

Only three named branches are maintained:

| Branch | Role |
| --- | --- |
| `main` | Maintainer development and testing |
| `adobe-replica` | Adobe replication experiments |
| `release` | Public default branch, source distribution and showcase |

New users install `release`; it can lag behind `main`. Shared work lands on `main` first under the owner's standing authorization, is checked there, then proceeds to a requested release promotion. An explicit main-only task leaves release untouched. Videos, showcase cases and their images stay on release; preserve them when promoting code instead of overwriting release with the main tree. Adobe experiments synchronize only when requested. Previous history is retained.

To prepare a clean source ZIP from a committed revision, use the installed project Node:

```bash
SEED_NODE_VERSION="$(/usr/bin/plutil -extract nodeVersion raw -o - kernel/config/macos.json)"
SEED_ARCH="$(/usr/bin/uname -m)"
if [ "$SEED_ARCH" = "x86_64" ]; then SEED_ARCH=x64; fi
".runtime/node-v${SEED_NODE_VERSION}-darwin-${SEED_ARCH}/bin/node" kernel/scripts/package-macos.mjs release
```

The package and `.sha256` file are written to `.cache/releases/`. It contains committed source, complete rules/Skills, license notices, pinned lockfiles and a per-file SHA-256 manifest in `delivery.json`. Recipient task/goal files are initialized without inheriting developer approvals. It excludes credentials, conversations, logs, snapshots, dependency directories and installed runtimes.

**Do not distribute a ZIP of your running project folder.** Use this packager. GitHub Download ZIP is a source snapshot; the customer packager additionally initializes recipient task records. Version setup and repackaging require Git. Packaging defaults to the committed `release` ref; it never silently falls back to `main` or `HEAD`. An explicit ref is allowed for a reviewed candidate/custom distribution; delivery.json records the actual ref, commit and initial branch.

Release checklist and known validation limits: [docs/release-checklist.html](docs/release-checklist.html). Public repository visibility and a published GitHub release are separate actions from preparing this candidate.

## License

Saplingagent is independent software, not an official OpenAI product. Commercial use requires separate written permission; third-party authentication has its own terms. See [NOTICE](NOTICE).

Project-owned source is available under **[PolyForm Noncommercial 1.0.0](LICENSE)**. It permits uses, modifications and distribution for its permitted noncommercial purposes, subject to its notice requirements. Commercial use needs a separate written agreement with the project owner; request authorization through [extendmachine](https://github.com/extendmachine). This is a source-available license, not an unrestricted open-source commercial grant.

The license includes defined permissions for certain noncommercial organizations. The exact [official terms](https://polyformproject.org/licenses/noncommercial/1.0.0) govern scope. Dependencies and bundled third-party materials retain their own terms in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); this project's restriction does not relicense them or claim ownership of user-generated applications.

## References and development rules

Codex authentication, usage and App Server documentation rechecked on **2026-10-14**. Dependency versions above describe this repository's pinned installation, rather than the newest upstream releases:

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Codex authentication](https://learn.chatgpt.com/docs/auth)
- [Codex usage and pricing](https://learn.chatgpt.com/docs/pricing)
- [Sign in with ChatGPT / App Server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
- [Local documentation](docs/index.html), [macOS guide](docs/macos-install.html), [service interfaces](docs/api-interfaces.html)

The user's project rules ship under `rules/`. Translating their prose does not relax approval, credential handling or task-coordination requirements. The complete [rules distribution guide](rules/DISTRIBUTION.md) applies only when explicitly asked to introduce/copy the rules into another project; normal installation requires no developer-specific rules source folder.

## Windows operation and delivery

Run `bash Saplingagent.sh --lang zh` in Git Bash. The script opens bilingual project/AI setup, followed by local launcher compilation. The legacy terminal menu is available with `SAPLING_LEGACY_MENU=1`. Explicit actions/flags are identical to Mac: `install --repair`, `configure --no-open`, `login --device-auth`, `opencode`, `start --no-open`, `doctor`, `logout`. See [Windows guide](docs/windows-install.html) / [中文 Windows 说明](docs/windows-install.zh.html).

Windows system detection/download/extraction uses its built-in PowerShell internally, embedded in kernel/scripts/windows/bootstrap.sh; there is no separate .ps1 file or user PowerShell command. UTF16 encoded command arguments preserve Unicode paths and leave stdin available for provider authentication. Windows menu actions run in the foreground. Diagnostics/web configuration use PowerShell directly; Git Bash's winpty is used when available for interactive install/Git setup/login/OpenCode/start console compatibility. Windows terminal shutdown/model interactions still require native-system testing. No WSL, global Node/Codex, registry/global PATH/permanent execution-policy modification is required.

The App Server is a project-owned native stdio subprocess. Credentials and agent state remain in local-secrets/codex/, local-secrets/opencode/, local-secrets/claude/ and shared local-secrets/api-keys/; dependencies/cache/state stay in the folder. The UI remains English; menu language does not change conversation data. Full Access remains current-user access. Git is required to supply Bash on Windows; fresh snapshots have no Git metadata or storage selection. Existing customer Git is preserved.

Restart app uses the existing persistent gateway and owned live PID-tree shutdown. Finish work before restarting. Forced parent/window termination, power loss and separately detached programs cannot guarantee cleanup; active command side effects are not undone. Ports/manager/launcher changes require normal stop and reopening the same Bash entry. No process-name/port kill, root elevation, automatic rollback or prompt resend is added.

To create a committed clean Windows source ZIP, use `<project-node> kernel/scripts/package-windows.mjs release .cache/releases`. Both platform packages include the one executable Saplingagent.sh, all companion sources/helpers/rules, fresh recipient records and per-file/ZIP hashes, excluding credentials/data/logs/dependencies/Git. Copy the complete folder, not just one script. Remove stale installation locks only after confirming the installer has stopped.

## Automatic device selection

The common Bash entry detects macOS or native Windows Bash environments and routes automatically. Mac chooses Intelx64 or AppleSiliconarm64 (including Rosetta). Windows verifies build17763+, selects native x64/ARM64 ahead of emulated-terminal architecture, checks official Node24.21.0 checksums and actual runtime architecture, then installs pinned Codex0.146.1/OpenCode1.19.0 native binaries. No manual CPU selection. Linux/WSL and32-bit devices fail before download. Re-run Install / repair dependencies after moving the source folder to another device; installed dependencies are OS-specific. Native Windows login/model/MCP/restart and ARM hardware tests remain unverified on the current Mac host.


## Automatic local ports

The unified launcher starts from each port in config/runtime.json and selects available, distinct loopback ports in ascending order. If5173 and5174 belong to another application, the new public page can use5175 and its internal Vite another free port. Backends and runtime control also receive selected ports, so changing only the browser port cannot leave a broken connection. Follow the printed Web page URL; browser opening, status checks and recovery use it. Existing applications are left running.

Selection applies only to this runtime instance, keeps the configuration/source Git clean, and stays fixed through Restart app/backend. The ignored .runtime/runtime-address.json lets Diagnostics find the active instance and is removed on normal owned shutdown. New launches scan again rather than permanently incrementing configured ports. If a port is taken in the short interval before an internal service binds, startup reports the error; relaunch to select again. No automatic killing, model call or credential change is part of port selection.

## Chat with files and inspect the result

Use the paperclip, drop files into AI chat or paste an image. Attachments stay in your local project and restore with sent messages (20MiB/file,10/message). After interface changes, AI can use page_read to inspect the open project page's fresh DOM, layout and optional rendered image, without an extra folder or screen-recording permission. Keep the page open; a closed page or unavailable image is reported explicitly. [Usage and limits](docs/runtime.html#chat-files-pages).

## Release identity

The installed **Kernel0.9.5** is the only Saplingagent version, read from `kernel/manifest.json`. Setup, footer, Bash and packages use it. There is no separate product version. Missing/invalid metadata is unavailable. Legacy `config/release.json` and `releaseVersion` receipt names remain compatibility mirrors/aliases; they are not runtime authority.

Downloadable source ZIPs record `releaseVersion` and the exact `sourceCommit` in `delivery.json`; their filenames contain both. For **0.9.5**, use the `release` branch source or one-line installer above. GitHub Releases entries/assets are separate and can still refer to older versions. This branch promotion preserves existing tags and does not publish new GitHub Release assets; a future formal publication must align its tag, page and receipts with the checked source. Do not increment that version without the owner’s instruction. See the [release checklist](docs/release-checklist.html) for code-first verification and the [published releases](https://github.com/extendmachine/Saplingagent/releases) for the actual publication status. Source tags, published Releases and real-device/model acceptance are separate facts.

### Kernel source boundary

All platform implementations, AI setup website, engine adapters, runtime manager, device defaults and installer/build helpers are contained in `kernel/`. Setup source: `kernel/ui/setup/`; generated setup assets: `kernel/.cache/setup/`. Application pages/services/MCP/Skills remain outside and are freely editable. Add business services through `config/services.json`. Small root and legacy-path adapters (including two Node-version JSON files for existing native launchers) only forward into the kernel to keep existing installations compatible; they contain no implementation. See [kernel boundary](kernel/CONTRACT.md#contained-platform-implementation-2026-10-19). Explicit kernel maintenance remains possible under Full Access. Relocation preserves conflict detection for locally edited old kernel files.

### Updating from historical kernel numbers

Old0.90/0.91/0.92 updaters misread0.9.4 as a downgrade. Use the new updater once from an isolated in-folder download with an explicit target, retaining conflicts, backups and customer files. See [one-time version migration](docs/kernel-version-migration.html). Do not overwrite your whole app or regenerate its baseline.


Configuration storage: temporary setup runs in a visible, session-owned
`../sapling-config-*` folder beside the project and is cleaned after Finish setup.
Persistent settings, credentials, tools and caches remain project-local.
See [storage and process locks](docs/configuration-storage.html).
