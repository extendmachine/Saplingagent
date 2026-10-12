# Workspace HTTP contract v1

2026-10-09, TASK-20261009-007; public index contracts/runtime-api.md. Loop 4311, except for GET /health requires internal Bearer token, from local-secrets/runtime/service-token. Without CORS, it is not for the front-end to call directly.

|Method/Address|Input|Successful output|
| --- | --- | --- |
| GET /health |Nothing| {ready:true,service:'workspace',version} |
| GET /sessions |Nothing|{sessions:[{id,title,updatedAt,engine,providerId,modelId}]}, update time in reverse order|
| POST /sessions | {title?,engine?,providerId?,modelId?} | 201 {session} |
| GET /sessions/:id |UUID/Security ID| {session} |
| PATCH /sessions/:id | {threadId?,messages?,title?,running?,activeRequestId?,requests?,expectedRevision?} | {session} |
| GET /preferences |Nothing| {preferences} |
| POST /preferences | {key,value,evidence} | 201 {preference} |
| DELETE /preferences/:id |Security ID| {ok:true} |

session：id,title,engine:'codex'|'opencode'|'claude',providerId:string|null,modelId:string|null,threadId:string|null,messages,createdAt,updatedAt,revision,running,activeRequestId:string|null,requests?. OpenCode and Claude Agent require providerId and modelId; selection fields cannot change after creation. Older stored records default to Codex.
Messages: up to 10,000, {id,role:'user'|'assistant'|'system'|'tool',text,status?,requestId?}, ID is unique, the text is up to 500,000 characters, and the total JSON is up to 4MiB.
Requests: up to 500, {id,status:'inProgress'|'completed'|'failed'|'interrupted',startedAt,completedAt?,error?}, ID is unique, time must be parsable, error up to 1000 characters. The account book is used for retrying, and the actual retry status is decided by the agent.
Title up to 200 characters; threadId up to 300 characters. Preference {id,key,value,evidence,createdAt}; key up to 256 characters, value JSON up to 64KiB, evidence required non-blank, up to 8192 characters, up to 5000 items, total JSON up to 4MiB. Long-term preferences are not automatically inferred.
HTTP request up to 5MiB, the first 10 seconds/request timeout 30 seconds. Unknown supplementary fields are not persistent.

Error {error:{code,message,requestId}}: 400 INVALID_INPUT/INVALID_JSON, 401 UNAUTHORIZED, 404 NOT_FOUND, 409 CONFLICT/UNSAFE_STORAGE, 413 PAYLOAD_TOO_LARGE, 500 CORRUPT_STORAGE/INTERNAL_ERROR. The error does not return the stack or private path.
Serial modification, reading waiting queue, JSON atomic replacement; optional expectedRevision to enable optimistic concurrency check. Contract compatibility extension retains existing fields. If the self-inspection is passed, the manual and real agent coordination will be recorded by the root coordinator, and the non-Git will be submitted without testing.

## Runtime restart preparation
Authenticated POST `/internal/runtime/prepare` atomically returns `{prepared:true}` or 409 `RUNTIME_BUSY` while mutations/work are pending. Prepared services reject subsequent mutations with 503 `RUNTIME_RESTARTING`; POST `/internal/runtime/release` returns `{prepared:false}`. These internal endpoints require the project Bearer token even for same-origin callers. Health remains available. This changes process lifecycle only, not OS-user Full Access.

## Claude Agent engine (TASK-20261012-005–009)

Engine ID `claude` uses the project-local official Claude Agent SDK, with API-only Anthropic Messages profiles. Each conversation binds `engine`, `providerId` (`sapling-<profile-id>`) and `modelId`; existing bindings are immutable. Configuration accepts custom HTTP(S) API base URLs ending in `/v1`; SDK transport removes this trailing API version before its own `/v1/messages` route. Keys remain in local-secrets, never public responses. The default takes effect after restart. Local initialization checks MCP and Skills without a model prompt; authentication means a saved key, not proven quota. Streaming, completion, interruption and failure use existing chat events. Missing native sessions are reported, never silently replaced. Full Access and the completion-review receipt remain unchanged. No claude.ai subscription login is offered.
