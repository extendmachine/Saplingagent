# Third-party notices

Saplingagent's PolyForm Noncommercial license applies to project-owned source. It does not replace the copyright or license terms of third-party software, dependencies or bundled tools. Their original notices must be retained when those components are redistributed.

Direct dependency metadata checked from the installed locked packages on 2026-10-10:

| Component | Version | License |
| --- | --- | --- |
| React / React DOM | 19.3.0 | MIT |
| assistant-ui React | 0.15.26 | MIT |
| assistant-ui Markdown | 0.14.20 | MIT |
| remark-gfm | 4.0.1 | MIT |
| lucide-react | 1.54.0 | ISC |
| TypeScript | 7.0.2 | Apache-2.0 |
| Vite | 8.3.4 | MIT |
| MCP TypeScript SDK | 1.32.1 | MIT |
| yaml | 2.9.1 | ISC |
| zod | 4.6.5 | MIT |
| OpenCode SDK / CLI | 1.19.0 | MIT |

This list covers direct packages, not every transitive dependency. Installed packages retain their own LICENSE/NOTICE files. The source ZIP does not embed node_modules or the Node/Codex binaries: the installer retrieves them from their original sources. Redistributing an installed runtime requires retaining the applicable notices of all included components.

Node.js and official Codex CLI retain their upstream licenses. Saplingagent does not claim their trademarks, model services or authentication rights. The bundled rules attachment `rules/clawtask-package-skill-v2.zip` is an imported Clawtask workflow/tool snapshot; its contents and attribution remain separate from the license grant for Saplingagent-authored source. The import does not grant rights to relicense that tool, operate the Clawtask platform or use OpenAI services commercially.

User-generated code and applications are not automatically relicensed by this project notice. Their ownership, external dependencies and distribution terms must be reviewed independently.

- **Claude Agent SDK 0.3.296 and its native platform packages** (`@anthropic-ai/claude-agent-sdk`): Anthropic. SDK use is governed by Anthropic Commercial Terms, with individual dependency licensing as supplied by the packages. This project's PolyForm Noncommercial license does not replace those terms or grant authentication rights. Official overview/terms entry: https://code.claude.com/docs/en/agent-sdk/overview ; package: https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk . Native binaries are installed locally by npm and are not bundled into the source ZIP.

## Project-local Go toolchain

Customer launcher compilation downloads official Go1.27.2 archives from https://go.dev/dl/ with pinned SHA256 verification. Go uses its BSD-style license; the downloaded distribution includes its LICENSE/PATENTS and remains in the customer's .runtime directory. The source package ships launcher source and checksum metadata, not a Go distribution or customer-generated executable. See kernel/launcher/REFERENCES.md.
