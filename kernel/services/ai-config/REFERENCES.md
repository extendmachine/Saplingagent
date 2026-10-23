# Official configuration sources

## Personal subscription setup (checked 2026-10-22 / TASK-20261022-002)

- https://code.claude.com/docs/en/authentication#generate-a-long-lived-token —
  `claude setup-token` creates a long-lived token for `CLAUDE_CODE_OAUTH_TOKEN`;
  this implementation accepts manual input and does not execute login or import
  global subscription stores. The endpoint cannot be replaced by a custom API URL.
- https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan —
  October7,2026 update describes current SDK/subscription-limit availability and
  plan API credits. It does not prove a saved token's expiry, quota or model access.
- https://code.claude.com/docs/en/legal-and-compliance — published SDK/binary,
  customer authentication and third-party offering conditions remain applicable.
  The owner requested personal local main use; no hosted offering, resale,
  commercial-auth approval or public release is established by these changes.

Public references were read without an account. Tests use synthetic credentials;
no real login, provider request or model call was performed. The pinned official
SDK is unchanged. Earlier dated import records below describe API-only imports,
which remain separate from this manual subscription-token scheme.

Checked 2026-10-11 / TASK-20261012-001, public documentation; accounts/keys required only for actual authentication/inference.

- https://learn.chatgpt.com/docs/app-server — OpenAI auth account/read, account/login/start/chatgpt/device code, cancel/completed; local pinned Codex0.146.1 schema generated in ignored research cache confirms fields. Existing local use; commercial/hosted authentication requires separately authorized SIWC, not supplied by this UI.
- https://learn.chatgpt.com/docs/config-file/config-advanced — OpenAI custom model provider base_url/env_key/wire_api; runtime uses pinned compatible Responses API fields and private environment, no unsupported CLI upgrade.
- https://opencode.ai/docs/providers/ — native custom provider config, npm package mapping for Chat Completions/Responses, apiKey/baseURL/models. Exact pinned OpenCode1.19.0 local server/config tested, not assumed from current v2 docs.
- https://opencode.ai/docs/config/ and https://opencode.ai/docs/sdk/ — project-local config/env and MCP status/provider catalog; current pinned SDK1.19.0 APIs inspected locally.

- https://openrouter.ai/docs/api_reference/overview — OpenAI-compatible /api/v1/chat/completions and tool support; preset uses /api/v1 base, model IDs include provider prefixes.
- https://platform.claude.com/docs/en/api/models/list — Anthropic /v1/models discovery and x-api-key/anthropic-version authentication.
- https://docs.ollama.com/api/openai-compatibility — local /v1 compatible endpoints, models and tool support dependent on model. Ollama itself/model weights are not installed by Saplingagent.

## Claude Agent SDK integration (2026-10-12, TASK-20261012-005–009)

- https://code.claude.com/docs/en/agent-sdk/overview — official embedded Claude Code agent loop, native tools, MCP, sessions, branding and Commercial Terms.
- https://code.claude.com/docs/en/agent-sdk/quickstart — API authentication; bundled native binaries; third-party claude.ai login requires prior approval. No subscription credential import is implemented.
- https://code.claude.com/docs/en/agent-sdk/configuration — project-only settingSources, env and system prompt.
- https://code.claude.com/docs/en/agent-sdk/streaming-output and https://code.claude.com/docs/en/agent-sdk/sessions — partial events, terminal results and explicit resume.
- https://code.claude.com/docs/en/agent-sdk/mcp and https://code.claude.com/docs/en/agent-sdk/plugins — local MCP and `.agents` local plugin discovery.
- https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk/0.3.296 — exact SDK and platform optional dependency metadata. Installed official sdk.d.ts verifies Query, spawn, permissions, hooks and MCP control signatures.

Public documentation and npm metadata need no login; real inference/model catalogs need the user's own API account and quota. No inference was sent to a real model for candidate validation. Local native/synthetic API tests establish this pinned version's behavior; Windows10 native acceptance remains pending.

## Credential import (checked 2026-10-13 / TASK-20261013-002)

- https://learn.chatgpt.com/docs/auth — Codex file/keyring/auto credential stores, CODEX_HOME/auth.json and official copying of local auth cache; public docs, real user's tokens needed only for auth. Pinned Codex0.146.1 runtime stays unchanged.
- https://learn.chatgpt.com/docs/app-server — account/read and owned browser/device OAuth; saving/importing credentials alone is not real inference. Existing local implementation, commercial authentication rights are separate.
- https://code.claude.com/docs/en/agent-sdk/quickstart — API/environment authentication and requirement for prior Anthropic approval before a third-party product offers claude.ai subscription login/rate limits. No approval supplied; only API credential import is implemented with pinned SDK0.3.296.
- https://code.claude.com/docs/en/authentication — ANTHROPIC_API_KEY; keychain/.credentials.json and CLAUDE_CONFIG_DIR distinctions. Import does not read subscription stores, run apiKeyHelper or acquire hosted permissions.
- https://code.claude.com/docs/en/settings — user settings.json and custom CLAUDE_CONFIG_DIR on macOS/Windows; only explicit API env fields are extracted, never settings/hook execution. Public documentation accessible without login; actual API access requires a user credential/quota.
