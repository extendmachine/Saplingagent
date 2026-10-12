# Native Windows source launcher

TASK-20261011-028 / Codex/root, 2026-10-11. User-selected target: Windows10 x64 Intel/AMD; updated Windows10 (19045 recommended), PowerShell5.1+, or Windows11 x64. Native x64/ARM64 selected automatically; 32-bit Windows not implemented. Root Saplingagent.sh is the only bilingual user entry on both platforms. Windows requires Git Bash; scripts/windows/bootstrap.sh embeds native system setup, with no standalone .ps1 file. Both use scripts/launcher/cli.mjs; scripts/macos/cli.mjs is a compatibility wrapper.

Node24.21.0 ZIP from https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip is pinned to SHA256158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541 in config/windows.json, verified against https://nodejs.org/dist/v24.21.0/SHASUMS256.txt on2026-10-11. Stage/exclusive lock/version check/rename prevents incomplete Node success. Install only downloads; doctor/login/start never bootstrap implicitly. Business installer has its own lock/signature marker and staged Codex replacement, then locked npm ci. npm runs through this Node's npm-cli.js, native executable Codex/OpenCode avoid .cmd spawning. Windows CLI env points to local credentials; no global account import, PATH/registry/permanent policy mutation.

The UTF8 .sh embeds a UTF16LE/base64 EncodedCommand to preserve Chinese and Unicode paths without an external PowerShell file. ProcessStartInfo inherits the console for interactive provider auth; Windows argv quoting avoids shell interpolation. Finally terminates the still-live owned launch PID tree on cancellation and restores process environment. Do not promise cleanup after forced parent death, power loss or externally detached programs. Full Access remains unchanged. Human setup/recovery steps are in docs/windows-install.html and .zh.html. Version/source ZIP uses committed files and fresh recipient records; Git for Windows supplies the required Bash shell; chat does not need a Git repository, while version controls/repackaging do.

Official sources checked2026-10-11 (public unless model auth noted):
- https://learn.chatgpt.com/docs/windows/windows-sandbox : native Windows and Windows10 best-effort upstream.
- https://learn.chatgpt.com/docs/app-server : stdio protocol, account requirements; project pins0.146.1.
- https://registry.npmjs.org/@openai/codex/0.146.1 : native win32-x64 optional binary.
- https://registry.npmjs.org/opencode-ai/1.19.0 and https://opencode.ai/docs/ : native Windows package, upstream recommends WSL for best experience; this candidate implements requested native Windows.
- https://raw.githubusercontent.com/nodejs/node/v24.21.0/BUILDING.md : exact Node Windows platform support.
- https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.archive/expand-archive : ZIP extraction.
- https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill : owned PID trees.

Self-checks use synthetic processes/no credentials or paid inference. PowerShell7.6.6 portable Mac parser/menu validation is not WinPS5.1/Windows10 acceptance. Native Windows test script skips OS integration on Mac; installed runtime --version checks require explicit SAPLING_WINDOWS_INSTALLED_TEST=1. Test source SHA/main status is authoritative in coordination records; do not treat this README as human approval.

- Exact Node24.21 source https://raw.githubusercontent.com/nodejs/node/v24.21.0/lib/child_process.js — checked2026-10-11, cmd /d /s /c outer quoting and windowsVerbatimArguments; follows native Node shell argument semantics. Public, no login.

## Automatic device selection (TASK032, 2026-10-11)

Get-WindowsDevice verifies Win32NT and prefers RuntimeInformation.OSArchitecture; if unavailable, the native machine PROCESSOR_ARCHITECTURE (read-only) and WOW64/process environment are fallbacks. Resolve-WindowsArchitecture maps AMD64/X64→x64 and ARM64→arm64; others fail before downloads. Matching ZIP/hash are selected from config/windows.json. Native Node then chooses the installed Codex/OpenCode optional package through process.arch. ARM64 Node archive official SHA2568779b1bde1d39f8d420e3b57aa657b39891af434d3de44a919044cec06785921 was verified at the same checksum URL on2026-10-11. Mac checks hw.optional.arm64 before uname to select native Apple Silicon from Rosetta; both bootstrap and Codex wrapper use this decision. No device inventory is persisted or uploaded.

Exact Node platform source https://raw.githubusercontent.com/nodejs/node/v24.21.0/BUILDING.md lists Windows x64 and arm64 Windows10+ support tiers; exact npm0.146.1/1.19.0 metadata confirms both Windows native binaries. Public sources checked2026-10-11, no login for metadata. Native Windows/hardware/model acceptance remains unverified, despite user's explicit instruction to adopt and push main now.

Windows build is read locally from HKLM/SOFTWARE/Microsoft/Windows NT/CurrentVersion and must be17763+ (Windows10 version1809+) before downloads, avoiding .NET compatibility-manifest version emulation. Registry is read only; native OS build/architecture is shown in the terminal, not persisted or uploaded.

## Unified Bash entry (TASK033)

Shell routing recognizes Darwin and native MINGW/MSYS/Cygwin uname values; Linux/WSL is rejected for installation. Windows Git Bash supplies cygpath/iconv/base64 and PowerShell.exe; winpty bridges interactive Windows console programs for login, OpenCode configuration and startup when available; install/diagnostics/logout use PowerShell directly. Bash validates action/flags first, passes a converted root via environment, encodes the embedded system program into a command argument (not stdin), and restores temporary MSYS argument conversion settings before child apps. No public .ps1/PowerShell menu remains. Shell files use LF through .gitattributes. Same Bash menu/language/flags on both platforms. Native Windows terminal/OAuth/provider behavior remains unverified. Sources checked2026-10-11: https://gitforwindows.org/ (Git Bash/shell integration), https://raw.githubusercontent.com/rprichard/winpty/master/README.md (Windows console bridge), exact Node BUILDING source above (Windows terminal interoperability). Public sources; Bash itself requires installation on Windows; model accounts remain separate.


## Terminal ownership fix (TASK037, 2026-10-11)

Windows menu actions now run in the foreground. The previous background dispatch can put a terminal bridge in a background process group; terminal control can then stop it before native PowerShell/device output. On MSYS, SIGTTOU is22 and a Bash stop status can be150 (128+22); the number alone does not prove that every customer failure has that cause. Install, diagnostics and logout use PowerShell directly without winpty, while native login/OpenCode/start retain foreground bridge support and stdin. Bash announces the selected native startup before launch, and PowerShell announces readiness before device detection, so future failures identify the boundary reached. No automatic retry or repeated install/model action is added.

Opt-in tests use an already available Python3 standard-library PTY driver on the Mac development host (`SAPLING_TEST_PYTHON`); Python is not an installer/customer dependency. Real macOS controlling-PTY tests demonstrate old background dispatch failing a foreground-ownership probe with150 and new dispatch passing; native terminal mode and simulated provider stdin are checked. Existing routing/Unicode/flags/failure/device parser tests apply. Windows10 native installation and Windows PowerShell5.1 remain recipient tests, not claimed by Mac checks. Use the complete latest source folder and retry Install / update; if failure remains, run `bash Saplingagent.sh --lang zh install` from Git Bash and retain the preceding startup/error text. Do not remove credentials, weaken global policy, or disable antivirus as a routine fix.

Official source checks,2026-10-11 /TASK037, public/no login:
- https://raw.githubusercontent.com/rprichard/winpty/master/src/unix-adapter/main.cc — winpty terminal mode operations/console bridge and native exit propagation.
- https://raw.githubusercontent.com/msys2/msys2-runtime/master/winsup/cygwin/include/cygwin/signal.h — exact MSYS SIGTTOU22 definition.
- https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_powershell_exe — Windows PowerShell EncodedCommand UTF16LE input and exit behavior.

## Standalone AI setup (TASK-20261012-004; supersedes earlier selector/prerequisite descriptions)

Menu Configure AI now opens an independent project-local React page through the shared launcher CLI and backend/ai-config. Installation must be complete; Node builds that UI with existing front dependencies, then an owned loopback service opens the browser. `configure --no-open` prints its URL instead. Finish setup returns to the Bash menu; tab close alone does not terminate the service. Windows configure runs directly through PowerShell, without winpty; native OAuth/device login uses an owned Codex App Server process.

Account tab uses the official Codex browser/device-code flow. API tab saves named custom endpoint/protocol/model/key schemes. Key files stay in local-secrets/api-keys; profiles in local-secrets/ai-config; account credentials in local-secrets/codex. No global import, automatic prompt or running-service restart. Saved OpenCode/API schemes satisfy startup access without requiring ChatGPT login. Explicit login/opencode commands remain recovery fallbacks; their legacy storage is retained. Diagnostics checks the selected scheme or legacy Codex login, without proving quota/network. Restart and use a new conversation after changing providers.

Self-checks cover Mac installation, actual setup page, private save, no-login OpenCode startup contracts and pinned native OpenCode catalog/MCP. Real OAuth, billable inference and native Windows10/browser/WinPS5.1 remain unverified. HTTP setup authentication does not change customer's Full Access file/command permissions. See ../../docs/ai-configuration.html and ../../backend/ai-config/CONTRACT.md.
