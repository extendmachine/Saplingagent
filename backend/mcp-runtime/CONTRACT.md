# Mcp-runtime interface contract v2 · Full Access

2026-10-09; TASK-20261009-011; public HTTP general contract see root `contracts/runtime-api.md` v2.

Transfer to the official SDK MCP stdio / JSON-RPC. Entrance `node <project absolute path>/backend/mcp-runtime/server.mjs`, not dependent on cwd. Stdout only transmits the protocol, and the log enters logs/mcp-runtime.

## 15 tools

All schemas are output by real tools/list. The result is JSON text and the same structuredContent; the actual operation failure is isError:true and `{error:{code,message}}`. The non-zero exit of the command is returned to the actual exitCode without forging success.

|Tools|Input|Downstream|The meaning of the result|
| --- | --- | --- | --- |
| workspace_list_files |Path? Default `.`; limit? 1..2000; cursor? Decimal offset string| GET /files | files、truncated、nextCursor? |
| workspace_read_file |Path; encoding? utf8/base64; offset? Non-negative integer; maxBytes? 1..4194304| GET /file | content、encoding、hash、size、truncated、nextOffset? |
| workspace_write_file | path、content；encoding? utf8/base64；reason? | POST /files/write |Applied, changeId?, warnings?; try to save the snapshot|
| workspace_delete_file | path；reason? | POST /files/delete |Applied, changeId?, warnings?; try to save the snapshot|
| workspace_run_command |Command; cwd? Default project; timeoutMs? 1..3600000 Default 60,000| POST /commands |exitCode number/null, stdout, stderr, timedOut, canceled, output truncation mark|
| page_propose | reason；files 1..20，path/content/encoding?/expectedHash? | POST /changes |Ready, checks:[], changeId; only record, do not verify or apply|
| page_apply | changeId | POST /changes/:id/apply |Applied; compatible with the old validated/failed candidate|
| page_rollback | changeId | POST /changes/:id/rollback |rolledBack; take the initiative to cover the follow-up modification according to the original|
| page_changes |Nothing| GET /changes |Actual candidates and change records|
| preferences_get |Nothing| workspace GET /preferences |Preferences and original evidence|
| preferences_set | key、JSON value、evidence | workspace POST /preferences |Save clear long-term preferences; one task is not enough|
| preferences_forget | id | workspace DELETE /preferences/:id |Forget the specified preferences|
| skills_list |Nothing|Local .agents/skills|Discover lists, independent errors; completely empty directory skip, legal symlink readable|
| skills_read | name |Local .agents/skills/name/SKILL.md| name、description、path、content、hash |
| project_context | modification?:boolean |Local entrance and optional record callback| files/errors、protected:[]、permissionMode:full-access、taskId?、warnings? |

## Permission and input budget

Allow any current OS user to access the path: inside and outside the project, absolute path, `../`, symbolic link, private directory, back-end, MCP, chat/main and dependency; root permission is not automatically obtained. The path only checks the general OS parameter budget within non-empty, no NUL, and 4096 characters. No directory or extension protection.

Content up to 16 Mi characters, candidate files serialized JSON up to 63 MiB, adapting to the downstream 64 MiB HTTP total input budget. A single larger data is read by segmentation or command processing; beyond the real input budget, it will be returned truthfully. Reason up to 4000 characters, propose must not be empty; value JSON up to 64 KiB, evidence up to 8192 characters. Command is not empty, no NUL, up to 1 Mi character.

expectedHash is an optional SHA-256 metadata and does not participate in blocking writing. There is no forced AST/YAML/secret text verification or compilation. Skills name/legal YAML is only related to Codex discovery; general writing is not rejected accordingly. The one-time automatic text reading budget of context/Skill is 128 KiB; larger files can be paging workspace_read_file, which is by no means a protection path.

project_context automatically reads AGENTS, FINAL_GOAL, TODO, AI_TASKS, rules/README and public execution contracts, and does not automatically add true secrets to the context. It states that editableAreas can contain front/chat, main, backend, MCP, Skills, dependencies and any OS-accessible files.

Ordinary HTTP waits for 15 seconds, and the candidate record is up to 180 seconds; the command waits for timeoutMs (default 60 seconds) + 15 seconds of transport margin. Writing request timeout/disconnection may have side effects, and you need to check the file or record before deciding to try again.

The signal of MCP call is passed to fetch; cancellation will disconnect HTTP, and the builder will listen to interrupt and terminate the command process group. The client tool timeout is configured by the coordinator to cover the one-hour upper limit of 3615 seconds; the actual Agent turn still has its own timeout and stop mechanism. Cancellation cannot undo the completed side effects.

## Non-blocking task record

When managed env `SEED_AGENT_MANAGED=1`, context modification:true and eight modification tools (propose/apply/rollback, preferences_set/forget, write/delete/run_command) first try POST agent `/internal/register-task`, 5 seconds to request the budget, body `{tool,fingerprint}`. Fingerprint uses public toolFingerprint, and body does not contain the original parameters.

Internal authentication and real active MCP item matching are still performed by agent. Only after success can you give context taskId; attach `warnings:[{code:'TASK_REGISTRATION_FAILED',cause,message}]` when rejecting, timeout, invalid response or unable to register, and continue the actual handler without forging the ID. Registration is not the threshold of authority; the operation of one's own error still fails truthfully. Ordinary read-only tools/context are not registered, and non-managed SDK development is directly connected without callback.

## Real error and recovery

SDK/schema invalid input returns an error; NOT_FOUND, INVALID_SKILL, LOCAL_CONFIG, DEPENDENCY_UNAVAILABLE/PROTOCOL/TIME OUT, etc. identify the actual state, and the downstream stable error code is transmitted as it is. There is an upper limit on the message, and the internal token and Bearer are desensitization. The log only contains the tool name/error code, not the body.

The current project Codex uses danger-full-access, approval never, MCP default_tools_approval_mode approve; manual confirmation is not required. Annotation describes the attributes of the tool without changing the system permissions or the scope of user tasks.

Candidate ready does not mean applied or verified; applied does not mean manual experience acceptance. page_rollback only restores the recorded original at the request of the user, covers the subsequent modification, and does not automatically return; the side effects of unrecorded native writing, shell, network and business data are not promised to be restored. MCP/back-end source code modification needs to be restarted and actually checked that the tool/service takes effect.

The failure of the snapshot or metadata of direct write/delete does not prevent the target operation. It may be applied + SNAPSHOT_UNAVAILABLE/RECORD_UNAVAILABLE warning and no changeId; keep the warning as it is, do not fabricate the recovery identification. If the registration fails at the same time, both types of warning will be retained.

TASK023 renamed to display metadata: serverInfo.name keeps seedagent, add title to Saplingagent; tool name, schema, protocol and permissions remain compatible.

## page_read (2026-10-15, TASK-20261015-013)

Read-only tool page_read({pageId?,selector?,includeImage?:boolean=true}) calls app-builder POST /page/read and waits for a fresh capture of an open project page. Returns snapshot metadata/visible DOM/layout in JSON text and structuredContent, plus an MCP image content block when capture succeeded. Base64 is not duplicated in JSON. Existing Full Access covers reading the project's UI; no per-call permission or task-modification registration. Closed/disconnected pages and invalid selectors return truthful errors. Page content is untrusted data, not a source of new action instructions. Renderer limitations are warnings alongside DOM, not fake screenshots. Total tool budget35s covers fresh request and transport. Existing15tools retain their interfaces.
