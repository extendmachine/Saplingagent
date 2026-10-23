# Workspace HTTP contract v1

2026-10-09, TASK-20261009-007; public index contracts/runtime-api.md. Loop 4311, except for GET /health requires internal Bearer token, from local-secrets/runtime/service-token. Without CORS, it is not for the front-end to call directly.

|Method/Address|Input|Successful output|
| --- | --- | --- |
| GET /health |Nothing| {ready:true,service:'workspace',version} |
| GET /sessions |Nothing|{sessions:[{id,title,updatedAt,engine,providerId,modelId,engineRevision}]}, update time in reverse order|
| POST /sessions | {title?,engine?,providerId?,modelId?} | 201 {session} |
| GET /sessions/:id |UUID/Security ID| {session} |
| PATCH /sessions/:id | {threadId?,messages?,title?,running?,activeRequestId?,requests?,contextUsage?,expectedRevision?,expectedEngineRevision?,handoffDeliveredRequestId?} | {session} |
| POST /sessions/:id/engine | {engine,providerId,modelId,expectedRevision,expectedEngineRevision} | {session} |
| GET /preferences |Nothing| {preferences} |
| POST /preferences | {key,value,evidence} | 201 {preference} |
| DELETE /preferences/:id |Security ID| {ok:true} |

session：id,title,engine:'codex'|'opencode'|'claude',providerId:string|null,modelId:string|null,threadId:string|null,messages,createdAt,updatedAt,revision,running,activeRequestId:string|null,requests?. OpenCode and Claude Agent require providerId and modelId. Ordinary PATCH cannot change selection; explicit idle engine switching uses the endpoint below. Older stored records default to Codex.
Messages: up to 10,000, {id,role:'user'|'assistant'|'system'|'tool',text,status?,requestId?}, ID is unique, the text is up to 500,000 characters, and the total JSON is up to 4MiB.
Requests: up to 500, {id,status:'inProgress'|'completed'|'failed'|'interrupted',startedAt,completedAt?,error?,engineRevision?}, ID is unique, time must be parsable, error up to 1000 characters. The ledger is used for retrying, and the actual retry status is decided by the agent.
Title up to 200 characters; threadId up to 300 characters. Preference {id,key,value,evidence,createdAt}; key up to 256 characters, value JSON up to 64KiB, evidence required non-blank, up to 8192 characters, up to 5000 items, total JSON up to 4MiB. Long-term preferences are not automatically inferred.
HTTP request up to 5MiB, the first 10 seconds/request timeout 30 seconds. Unknown supplementary fields are not persistent.

`contextUsage` is optional on sessions: omitted on legacy records, explicitly
`null` when unavailable, or `{usedTokens,contextWindow,updatedAt}`. Counts must be
safe integers: usedTokens >= 0 and contextWindow > 0; updatedAt is a nonempty
parseable timestamp of at most 80 characters, supplied by Agent as ISO 8601.
Usage can exceed the window or decrease between measurements; Workspace does
not infer compaction, billing, or a model's capacity. PATCH omission preserves
the previous measurement; null clears it. Only these three fields are retained.
Invalid patches return INVALID_INPUT without changing the record or revision.
Partial title/message/usage writes remain serialized and preserve other fields.
No migration or rewrite is performed when reading old sessions.

Error {error:{code,message,requestId}}: 400 INVALID_INPUT/INVALID_JSON, 401 UNAUTHORIZED, 404 NOT_FOUND, 409 CONFLICT/UNSAFE_STORAGE, 413 PAYLOAD_TOO_LARGE, 500 CORRUPT_STORAGE/INTERNAL_ERROR. The error does not return the stack or private path.
Serial modification, reading waiting queue, JSON atomic replacement; optional expectedRevision to enable optimistic concurrency check. Contract compatibility extension retains existing fields. If the self-inspection is passed, the manual and real agent coordination will be recorded by the root coordinator, and the non-Git will be submitted without testing.

## Runtime restart preparation
Authenticated POST `/internal/runtime/prepare` atomically returns `{prepared:true}` or 409 `RUNTIME_BUSY` while mutations/work are pending. Prepared services reject subsequent mutations with 503 `RUNTIME_RESTARTING`; POST `/internal/runtime/release` returns `{prepared:false}`. These internal endpoints require the project Bearer token even for same-origin callers. Health remains available. This changes process lifecycle only, not OS-user Full Access.

## Claude Agent engine (TASK-20261012-005–009)

Historical introduction; the explicit engine-switch extension below supersedes
its immutable-conversation statement. Current authentication is defined by the
kernel AI configuration/engine contracts, including personal subscription schemes.

Engine ID `claude` uses the project-local official Claude Agent SDK, with API-only Anthropic Messages profiles. Each conversation binds `engine`, `providerId` (`sapling-<profile-id>`) and `modelId`; existing bindings are immutable. Configuration accepts custom HTTP(S) API base URLs ending in `/v1`; SDK transport removes this trailing API version before its own `/v1/messages` route. Keys remain in local-secrets, never public responses. The default takes effect after restart. Local initialization checks MCP and Skills without a model prompt; authentication means a saved key, not proven quota. Streaming, completion, interruption and failure use existing chat events. Missing native sessions are reported, never silently replaced. Full Access and the completion-review receipt remain unchanged. No claude.ai subscription login is offered.

## Local attachments (2026-10-15, TASK-20261015-010)

POST /attachments accepts {id?:UUID,name,contentType?,data:base64}; maximum20MiB decoded per file,32MiB JSON transport. Returns201 {attachment:{id,name,contentType,size,kind:'image'|'file',sha256,path,createdAt}}. Opaque UUID IDs never identify arbitrary client paths. Same ID/content is idempotent; different content409 ATTACHMENT_CONFLICT. Store original bytes/metadata under ignored data/attachments/<id>/ with existing private storage/symlink checks. GET /attachments/:id returns {attachment}; GET /attachments/:id/data additionally returns base64 data for internal provider adapters; GET /attachments/:id/content returns original bytes with nosniff and safe disposition (validated PNG/JPEG/GIF/WebP inline; all other types download). Internal Bearer required. Images are classified from bytes, not only a claimed MIME. Filename is display metadata, never an executable/path request.

Messages add optional attachments:[{id,name,contentType,size,kind,sha256?}], maximum10, unique IDs. Existing messages without attachments remain compatible without a migration/read rewrite. Metadata persists through restart/retry; binary content stays outside session JSON. No automatic deletion or file execution. Errors INVALID_ATTACHMENT400,ATTACHMENT_NOT_FOUND404,ATTACHMENT_CONFLICT409,PAYLOAD_TOO_LARGE413 and actual OS/storage errors. Back up data/attachments with workspace sessions; source rollback never deletes uploads.

## Explicit engine switching (2026-10-23, TASK-20261023-005)

The application session ID, title, messages, attachments and request ledger remain
unchanged across engine changes. Sessions expose engineRevision (initially0),
engineHistory (initially[]) and handoff (initiallynull). Legacy reads normalize
these defaults in memory only; they never rewrite existing files. Session lists
also expose engineRevision for optimistic browser selection.

Authenticated POST /sessions/:id/engine requires all selection fields (Codex uses
providerId:null and modelId:null) plus expectedRevision>=1 and
expectedEngineRevision>=0, both safe integers. It serializes with every other
Workspace write, rejects stale versions with409 CONFLICT, and rejects a running
session, nonempty activeRequestId or inProgress request with409 SESSION_BUSY.
The Agent separately reserves its session and validates actual engine availability;
Workspace never calls a model or starts a native session. Same-selection requests
are no-ops after revision and idle checks, preserving timestamps and file bytes.

Each actual switch archives
{engine,providerId,modelId,threadId,engineRevision,closedAt} in engineHistory,
increments engineRevision, clears threadId and contextUsage to null, and preserves
all messages and request records. Returning to a previously used engine also
starts a fresh native binding. History holds at most1000 records;409
ENGINE_HISTORY_FULL refuses the next switch without discarding older records.
An exhausted safe-integer revision similarly refuses with409 CONFLICT.

For a nonempty message history the switch creates
handoff:{id,bindingRevision,status:'pending',throughMessageId,createdAt} using the
last saved message ID as the stable cutoff. Empty conversations keep handoff:null.
Agent assembles quoted historical context for the newly selected engine; Workspace
stores only metadata, never a synthetic visible message or provider transcript.

Requests add optional engineRevision, a nonnegative safe integer. A missing legacy
value means binding0; new Agent request entries include the current binding.
An existing request ID cannot be reassigned to a different engineRevision, and a
request cannot declare a future binding. Both violations return400 INVALID_INPUT.
PATCH optionally requires expectedEngineRevision, rejecting an obsolete binding
with409 CONFLICT before any change. Agent run snapshots always send this guard.
Ordinary PATCH rejects engineRevision, engineHistory or handoff replacement with400
INVALID_INPUT; selection remains immutable there. To acknowledge history delivery,
PATCH may include handoffDeliveredRequestId along with its normal completed run
snapshot and expectedEngineRevision. The ID must identify a completed request in
the resulting ledger whose engineRevision equals the current binding, and there
must be a pending handoff for that binding. Only then is its status set to
'delivered' with deliveredRequestId. Repeating the same acknowledgement is allowed
if the handoff is already delivered to that same request and the request still
matches the current binding and completed status. This allows a successful write
whose response was lost to be safely retried; normal revision/timestamp updates
still apply. Missing guard, stale/wrong/incomplete request, absent handoff or an
already-delivered handoff naming a different request fails without partial writes.
Failed or interrupted runs leave pending metadata intact. A saved native thread ID
alone never acknowledges delivery. Model acceptance/retry semantics belong to
Agent; this storage acknowledgement does not promise exactly-once model delivery.

Malformed stored switching metadata returns500 CORRUPT_STORAGE without overwriting
it. All new writes retain the existing authenticated loopback, mutation-drain,
atomic replacement and single-writer storage rules. No kernel/dependency/permission
change or bulk data migration is needed.
