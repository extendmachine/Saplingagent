# Service index

The actual source location follows the user's front/backend requirements, and the services examples in the public rules are applied according to the backend. This catalog is only for indexing.

|Object|Table of contents|State|
| --- | --- | --- |
|Single-page chat| ../front/ |Realization and self-testing are completed, and the actual model/refresh/stop has been verified|
| AI setup | ../kernel/services/ai-config/ and ../kernel/ui/setup/ |Demand-started independent local account/API wizard; no model prompt|
| Agent | ../backend/agent-runtime/ |Official App Server and Real SSE/Full Access/Continuous Session|
| Workspace | ../backend/workspace/ |Atomic Local Session/Preference/Account Book|
| Builder | ../backend/app-builder/ |Complete file/command execution, optional candidate and user manual recovery|
| MCP | ../backend/mcp-runtime/ |15 tools, three Skills, actual stdio joint adjustment|
|Business functions|../front/features/ and ../backend/features/|It is built according to the subsequent user dialogue, and there is no preset function at the beginning.|

EACH ACTUAL SERVICE HAS SERVICE/CONTRACT/DEPLOY/REFERENCES AND TASK HANDOVER. Run node scripts/dev.mjs; root TODO column actual verification and waiting for manual experience.

2026-10-09 Latest permissions: Full Access, backend, MCP, front-end base, etc. without MCP directory protection or mandatory threshold; the old controlled scope is updated according to TASK010 to 013.

## Persistent runtime control
`scripts/dev.mjs` now supervises frontend and backends using backend/runtime-manager. Public frontPort is a persistent same-origin gateway; internal Vite uses vitePort (default5174). Restart app reloads selected source; Restart backend preserves frontend. Optional services are discovered from the selected checkout. Recovery route `/__saplingagent/runtime` stays available during failure; manager/launcher/port changes require the Mac launcher. See kernel/services/runtime-manager/CONTRACT.md and DEPLOY.md.
