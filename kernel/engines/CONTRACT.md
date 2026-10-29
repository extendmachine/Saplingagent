# Claude adapter authentication contract

TASK-20261022-004, 2026-10-22. The existing ClaudeProvider constructor, start,
execute, interrupt and close interface is unchanged. Input comes from the shared
AI configuration contract. Each profile retains its providerId and model binding.

- `kind:api`: use its API key and normalized sdkBaseUrl; explicit noAuth uses the
  existing anonymous-endpoint placeholder. Subscription credentials are ignored.
- `kind:subscription`: require a nonempty oauthToken and use only
  CLAUDE_CODE_OAUTH_TOKEN for the official SDK process. Do not set an API key or
  custom inference endpoint. A missing/invalid token or unsupported kind fails
  closed with CLAUDE_AUTH_REQUIRED, without falling back to another scheme.

Inherited Claude/Anthropic authentication and cloud routing are removed before
selecting a profile. Authentication changes require the existing app restart;
running turns and saved sessions are not silently retried or reassigned. The
explicit application MCP environment clears credential and cloud selectors; the
SDK remains responsible for native tool subprocess behavior. Full Access means an
authorized tool can still read local files: this is not a credentials sandbox.

Ready/authenticated describe a loaded credential and successful local control/MCP
handshake only. They do not verify subscription eligibility, expiry, quota or model
access. No account/model request is sent just to save or select the scheme.
Provider errors are bounded and redact all loaded profile credentials; raw SDK
error causes, stacks and extra data are not forwarded as public error objects.
## Codex model catalog and selection (TASK-20261029-003)

`codex-models.mjs` reads every model/list page with cursor/nextCursor and rejects malformed, cyclic or excessive pagination without publishing partial results. IDs are native `model` values. Picker labels and reasoning options come from the returned catalog; no hard-coded model list is substituted. Catalog membership does not verify account access.

The shared provider contract accepts Codex modelId null or a bounded nonempty string and rejects provider overrides. `selectCodexModel` validates explicit account choices without fallback, uses a supported effort, and keeps API schemes fixed to their configured model. Only automatic selection may use the catalog default/first model when a preferred ID is missing, with a visible warning. `reportedModel` accepts a bounded native model field, never a selected-value substitute. Runtime persistence and HTTP behavior belong to Agent/workspace.
