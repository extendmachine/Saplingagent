# Codex conversation relocation references

Task: TASK-20261019-020. Checked2026-10-19 by Codex. No account or model request was
used for documentation/protocol verification.

| Information | Official source | Purpose and access | Applicable version |
| --- | --- | --- | --- |
| App Server threads and resume | https://learn.chatgpt.com/docs/app-server | Public OpenAI documentation; confirms thread-ID resume, experimental opt-in and effective per-thread configuration. No login required to read. | Current documentation; local implementation pins0.146.1. |
| Exact native resume path field | `codex app-server generate-json-schema --experimental --out DIR`, generated `v2/ThreadResumeParams.json` | Official pinned local executable. `path` is marked unstable; a nonempty path overrides threadId for a nonrunning thread, requiring independent ID checks. Generation needs no account or model request. Generated files are verification cache, not shipped source. | codex-cli0.146.1 |

The public documentation does not promise a stable project-directory relocation
or SQLite-editing API. Compatibility therefore uses native resume and verifies the
result. The isolated native test establishes path persistence for the pinned
version without modifying the database or historical JSONL itself. Update this
test and compatibility review before changing the Codex dependency version.

## Personal Claude subscription token (TASK-20261022-004)

Checked 2026-10-22 by Codex. These public documents were read without an account;
using a subscription token requires the account owner's official browser approval.
The implementation retains Agent SDK 0.3.296 / Claude Code 2.1.296, whose installed
type/source metadata was inspected. Authentication compatibility and permission to
offer a product are distinct. No actual subscription or model request was tested.

| Source | Verified purpose and scope |
| --- | --- |
| [Claude Code authentication](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token) | `claude setup-token` prints a long-lived token for CLAUDE_CODE_OAUTH_TOKEN after the official authorization flow. It authenticates a Pro/Max/Team/Enterprise subscription, supports model requests and local MCP, not Remote Control or claude.ai connectors. API keys take precedence if also supplied. Bare mode ignores this OAuth variable. |
| [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) | SDK wraps the official binary. The product guidance requires prior approval before third-party developers offer claude.ai login or subscription limits through their products. |
| [Use the SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) | The October 7, 2026 update says Agent SDK, `claude -p` and third-party app usage can still draw from subscription limits. This describes current usage, not blanket product approval. |
| [Account authentication conditions](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account) | Products for others should use API/cloud authentication. Anthropic may allow certain third-party tools and charge usage credits; users remain responsible for applicable charges. |
| [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use) | Distinguishes end-user use of the unmodified binary from third-party account/token mediation and routing on behalf of others. It is not an authorization granted to this project. |

The owner-requested option is local personal configuration on main. It does not
automate a claude.ai login, patch the official binary, spoof a client identity,
share accounts, route traffic for other users or assert free/unlimited usage.
Future distribution should review the current conditions independently. Token
values remain outside documentation and Git; the adapter receives them only from
the project's shared private configuration contract.
