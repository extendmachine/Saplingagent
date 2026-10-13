# TASK-20261012-017 OpenCode message ownership

- Executor/coordinator: Codex/root; created2026-10-12.
- Source: detached .worktrees/opencode-message-role, baseline main4de09575fcc59ac13623eca940a9beeb8eca1acd.
- Authority: .worktrees/coordination/AI_TASKS.md and TODO.md.
- Status: implementation/self-check complete; exact source SHA and main result recorded in authority after freezing.

## Goal and scope

Repair deployed OpenCode user-message echoes exposing internal context as assistant output. Only backend/agent-runtime provider/server/tests/service docs/references/handoff. No frontend/dependency/credential/history/permission change. Project human troubleshooting has independent TASK018. Full Access remains unchanged.

## Decisions

Explicit native messageID binds assistant role/parentID to each submitted turn. Subscribe before prompting, ignore user/synthetic/ignored/summary and unrelated parts, buffer out-of-order snapshots and recover uncertain metadata from native message storage at idle. Deduplicate cumulative text without rewinding older snapshots. Send dynamic runtime guidance/preferences as system context and raw user text as parts. Preserve truthful prompt/API/idle/stop errors and release run caches. Do not silently clean stored conversations; old native user messages can contain previous context.

## Actual verification

86 Agent tests passed,0 skipped on this Mac host. Twelve new protocol/HTTP/native cases cover user/internal echo suppression, parent/session ownership, order/duplicates, tools/reasoning, native-error/empty states, prompt rejection, cancellation and metadata recovery. Native pinned OpenCode1.19.0 connected local synthetic Chat Completions for streamed reply, actual MCP tool call, continued native thread and HTTP401 failure; no customer key or paid model. Existing Codex/Claude/Git/timeout/cancellation tests passed. HTTP test further strengthened to verify failed prompt persistence and reran successfully (part of the same12, not an added count). Actual browser against isolated real Agent/adapter verified send, refresh and a second turn without internal instructions. Screenshot .cache/chat-proof.png. Preview uses simulated provider/workspace, no runtime manager, and was stopped after checking. No frontend source changes/build required.

## Limits and authorization

Windows10 and the reported customer MiniMax account/protocol/quota remain unverified. No human acceptance claimed. Owner standing instruction authorizes appropriate self-checked main merge/push without another confirmation; release/testcode synchronization is not requested. Root preexisting dirty records and foreign coordination prefixes are preserved. Changes stay inside complete project folder; source rollback keeps data and local-secrets.

## Sources and next steps

Official https://opencode.ai/docs/sdk/ and https://opencode.ai/docs/server/ checked2026-10-12, pinned SDK generated types checked locally. No SDK upgrade. Freeze this service commit and independently commit TASK018 docs; synchronize main normally, verify advertised remote refs and preserve other refs/dirty files. Users update fixed source, restart backend/app and begin a fresh conversation; real API errors require provider configuration evidence, never keys in chat.
