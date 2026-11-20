# Shared runtime references

Checked2026-11-03 for TASK-20261103-001. These public pages need no login;
model authentication remains a separate explicit configuration operation.

- [Codex App Server](https://developers.openai.com/codex/app-server/): CLI
  integration and protocol. Reuse the tested pin, not merely a filename.
- [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript):
  pathToClaudeCodeExecutable supports a separately installed CLI. Omit optional
  native packages only in the isolated SDK group. SDK0.3.296 pairs with2.1.296.
- [Windows symbolic links](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createsymboliclinkw)
  and [Junction](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/mklink):
  symlinks can require Developer Mode/elevation; directory junctions and a
  real-path/copy fallback avoid making elevation an installation requirement.
- Official Node/Go archive sources remain nodejs.org/dist and go.dev/dl with
  checksums in kernel/config/ and launcher/toolchain.json. Third-party licenses
  and authentication rights remain separate from MIT project source.
