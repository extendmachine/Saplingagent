# Share the public contract

runtime-api.md is the local HTTP/SSE field index, and each service CONTRACT is the detailed authority. agent-tools.mjs only shares the tool parameter normalization/fingerprint protocol, which is used to match the current request with Agent before the MCP change, and does not include the private implementation or real credentials of business services. The front-end HTTP type is in front/chat/runtime-api.ts; the official MCP input schema is registered by the service SDK.

The current contract v2 is Full Access, and there is no directory/compulsory verification threshold; see runtime-api.md for general files and command interfaces.

## Persistent runtime control
`scripts/dev.mjs` now supervises frontend and backends using backend/runtime-manager. Public frontPort is a persistent same-origin gateway; internal Vite uses vitePort (default5174). Restart app reloads selected source; Restart backend preserves frontend. Optional services are discovered from the selected checkout. Recovery route `/__saplingagent/runtime` stays available during failure; manager/launcher/port changes require the Mac launcher. See backend/runtime-manager/CONTRACT.md and DEPLOY.md.
