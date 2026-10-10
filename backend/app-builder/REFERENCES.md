# Official information of app-builder

At present, TASK-20261009-012 only uses the built-in module of Node. 2026-10-09 The following official pages and uses have been checked online; the online document shows v26.11.1, local isolation test 26.4.0, package declaration >=24.11.

|Information|Official Link / Organization|Purpose|Login or permission|Applicable interface/version|Final check date|Task|
| --- | --- | --- | --- | --- | --- | --- |
| Node File system | [File system](https://nodejs.org/api/fs.html) / Node.js |Native read and write, copyFile original, unlink/readlink and byte paging|Documents do not need to be logged in; execute according to OS users| node:fs/promises，>=24.11 | 2026-10-09 | TASK-20261009-012 |
| Node child_process | [Child process](https://nodejs.org/api/child_process.html) / Node.js |Spawn current user shell, independent process group and output life cycle|Documents do not need to be logged in; execute according to OS users| node:child_process，>=24.11 | 2026-10-09 | TASK-20261009-012 |
| Node HTTP | [HTTP](https://nodejs.org/api/http.html) / Node.js |Loopback, request/response cancel and server.close|No need to log in for documents; Business Bearer| node:http，>=24.11 | 2026-10-09 | TASK-20261009-012 |

No external release platform, model SDK or third-party parsing package dependence. The old TASK008's TypeScript/Vite/Babel/css-tree/yaml check decision to keep the historical handover, and the forced build, reference and skill frontmatter check have been removed at present; the historical data does not represent the current execution restrictions. The public integration source is maintained by the MCP/agent-runtime independent service.
