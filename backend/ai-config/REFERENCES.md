# Official configuration sources

Checked 2026-10-11 / TASK-20261012-001, public documentation; accounts/keys required only for actual authentication/inference.

- https://learn.chatgpt.com/docs/app-server — OpenAI auth account/read, account/login/start/chatgpt/device code, cancel/completed; local pinned Codex0.146.1 schema generated in ignored research cache confirms fields. Existing local use; commercial/hosted authentication requires separately authorized SIWC, not supplied by this UI.
- https://learn.chatgpt.com/docs/config-file/config-advanced — OpenAI custom model provider base_url/env_key/wire_api; runtime uses pinned compatible Responses API fields and private environment, no unsupported CLI upgrade.
- https://opencode.ai/docs/providers/ — native custom provider config, npm package mapping for Chat Completions/Responses, apiKey/baseURL/models. Exact pinned OpenCode1.19.0 local server/config tested, not assumed from current v2 docs.
- https://opencode.ai/docs/config/ and https://opencode.ai/docs/sdk/ — project-local config/env and MCP status/provider catalog; current pinned SDK1.19.0 APIs inspected locally.

- https://openrouter.ai/docs/api_reference/overview — OpenAI-compatible /api/v1/chat/completions and tool support; preset uses /api/v1 base, model IDs include provider prefixes.
- https://platform.claude.com/docs/en/api/models/list — Anthropic /v1/models discovery and x-api-key/anthropic-version authentication.
- https://docs.ollama.com/api/openai-compatibility — local /v1 compatible endpoints, models and tool support dependent on model. Ollama itself/model weights are not installed by Saplingagent.
