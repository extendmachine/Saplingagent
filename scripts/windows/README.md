# Native Windows source launcher

TASK-20261011-028 / Codex/root, 2026-10-11. User-selected target: Windows10 x64 Intel/AMD; updated Windows10 (19045 recommended), PowerShell5.1+, or Windows11 x64. ARM/32-bit Windows not implemented. Root Saplingagent.ps1 is the single bilingual Windows entry; macOS keeps Saplingagent.sh. Both use scripts/launcher/cli.mjs; scripts/macos/cli.mjs is a compatibility wrapper.

Node24.21.0 ZIP from https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip is pinned to SHA256158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541 in config/windows.json, verified against https://nodejs.org/dist/v24.21.0/SHASUMS256.txt on2026-10-11. Stage/exclusive lock/version check/rename prevents incomplete Node success. Install only downloads; doctor/login/start never bootstrap implicitly. Business installer has its own lock/signature marker and staged Codex replacement, then locked npm ci. npm runs through this Node's npm-cli.js, native executable Codex/OpenCode avoid .cmd spawning. Windows CLI env points to local credentials; no global account import, PATH/registry/permanent policy mutation.

PowerShell5.1 Chinese source is UTF8 with BOM. ProcessStartInfo inherits the console for interactive provider auth; Windows argv quoting avoids shell interpolation. Finally terminates the still-live owned launch PID tree on cancellation and restores process environment. Do not promise cleanup after forced parent death, power loss or externally detached programs. Full Access remains unchanged. Human setup/recovery steps are in docs/windows-install.html and .zh.html. Version/source ZIP uses committed files and fresh recipient records; Git is optional for chat but needed for version controls and repackaging.

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
