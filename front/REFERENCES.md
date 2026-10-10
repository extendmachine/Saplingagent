# Front official information

The actual dependence comes from the project package-lock and the installation package type, and the public document can be updated; this interface capability is compared with the package type of 0.15.26/0.14.20 one by one. The following TASK-20261009-009 new usage data is actually checked on 2026-10-09; the basic React/Vite/Lucide document inherits TASK-003, and the version is used.

|Name|Official website / domain name|Purpose|Login/Permission|Actual version|Check and tasks|
| --- | --- | --- | --- | --- | --- |
| assistant-ui external-store | https://www.assistant-ui.com/docs/runtimes/custom/external-store / assistant-ui.com |Real external news, isRunning, onCancel, stream update|No login is required for public documents.| @assistant-ui/react 0.15.26 | 2026-10-09 / TASK-009 |
| assistant-ui Composer | https://www.assistant-ui.com/docs/api-reference/primitives/composer / assistant-ui.com |Input, send and stop|Same as above|Same as above| 2026-10-09 / TASK-009 |
| assistant-ui Markdown | https://www.assistant-ui.com/elements/markdown-text / assistant-ui.com |Markdown, smooth and defer of message parts|Same as above| @assistant-ui/react-markdown 0.14.20 | 2026-10-09 / TASK-009 |
| remark-gfm | https://github.com/remarkjs/remark-gfm/tree/4.0.1 / github.com/remarkjs |MarkdownTextPrimitive's remarkPlugins enables GFM table/stask line/task list|Public documents, no account number or permission| remark-gfm 4.0.1，remark-parse 11.0.0 | 2026-10-09 / TASK019 |
| React | https://react.dev/learn / React |Status, error boundary and lazy loading|Public documents| react/react-dom 19.3.0 |2026-10-09 / TASK-003, 009 reuse|
| Vite | https://vite.dev/guide/ / vite.dev |Local proxy and construction|Public documents| 8.3.4 |2026-10-09 / TASK-003, 009 Reuse Package Type|
| Lucide | https://lucide.dev/guide/react / lucide.dev |Send/Stop/Status icon|Public documents| 1.54.0 |2026-10-09 / TASK-003, 009 reuse|

Markdown package registry actual peerDependencies @assistant-ui/react ^0.15.0, React ^18 or ^19, conforming to the current installation; npm audit 203 packages, 0 vulnerabilities. Raw HTML, code execution or remote picture automatic reading is not enabled. There is no front-end platform account, key or login entrance.
The old Markdown API page failed to access. It has been changed to the official accessible elements address, and does not rely on the uncertain page content. The official source code and type are used for the final actual component signature.
Dependent licenses are kept in the installed package; seed distribution, third-party license attachments and cloud release are not in this task.

TASK019 Check the official remark-gfm 4.0.1 README and the installed @assistant-ui/react-markdown 0.14.20 source code/type/README: MarkdownTextPrimitiveProps inherit ReactMarkdown Options, remarkPlugins real incom parser; keep defer. Official assistant-ui example: https://raw.githubusercontent.com/assistant-ui/assistant-ui/main/packages/react-markdown/README.md (public, no login required; check on 2026-10-09, the actual signature is subject to the locked installation package). Npm reviewed 221 packages this time, 0 vulnerabilities; the existing dependent version has not been upgraded.
