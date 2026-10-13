# Official information of app-builder

At present, TASK-20261009-012 only uses the built-in module of Node. 2026-10-09 The following official pages and uses have been checked online; the online document shows v26.11.1, local isolation test 26.4.0, package declaration >=24.11.

|Information|Official Link / Organization|Purpose|Login or permission|Applicable interface/version|Final check date|Task|
| --- | --- | --- | --- | --- | --- | --- |
| Node File system | [File system](https://nodejs.org/api/fs.html) / Node.js |Native read and write, copyFile original, unlink/readlink and byte paging|Documents do not need to be logged in; execute according to OS users| node:fs/promises，>=24.11 | 2026-10-09 | TASK-20261009-012 |
| Node child_process | [Child process](https://nodejs.org/api/child_process.html) / Node.js |Spawn current user shell, independent process group and output life cycle|Documents do not need to be logged in; execute according to OS users| node:child_process，>=24.11 | 2026-10-09 | TASK-20261009-012 |
| Node HTTP | [HTTP](https://nodejs.org/api/http.html) / Node.js |Loopback, request/response cancel and server.close|No need to log in for documents; Business Bearer| node:http，>=24.11 | 2026-10-09 | TASK-20261009-012 |

No external release platform, model SDK or third-party parsing package dependence. The old TASK008's TypeScript/Vite/Babel/css-tree/yaml check decision to keep the historical handover, and the forced build, reference and skill frontmatter check have been removed at present; the historical data does not represent the current execution restrictions. The public integration source is maintained by the MCP/agent-runtime independent service.

## Windows implementation sources (checked 2026-10-11)

- Node24.21 child_process: https://nodejs.org/download/release/v24.21.0/docs/api/child_process.html — Windows .cmd limitations, signal behavior and owned process lifecycle. Public; project Node24.21.0.
- Microsoft taskkill: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill — /PID /T /F termination of an owned live process tree. Public; Windows10/11 x64; current-user OS rights.
- OpenAI Windows: https://learn.chatgpt.com/docs/windows/windows-sandbox — native PowerShell, Windows11 recommendation and recent Windows10 best effort. Public; this project still pins Codex0.146.1 and retains Full Access. Real account required for inference; no sandbox migration is inferred from newer docs.
- Exact npm metadata https://registry.npmjs.org/@openai/codex/0.146.1 and https://registry.npmjs.org/opencode-ai/1.19.0 — native Windows optional dependencies; local OpenCode postinstall selects executable. Public, downloads/install required; no model request.

- Exact Node24.21 source https://raw.githubusercontent.com/nodejs/node/v24.21.0/lib/child_process.js — checked2026-10-11, cmd /d /s /c outer quoting and windowsVerbatimArguments; follows native Node shell argument semantics. Public, no login.
