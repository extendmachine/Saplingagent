# Agent task and operation period registration

The latest full authority handover TASK-20261009-010.md; historical development handover TASK-20261009-005.md; root AI_TASKS/TODO is the authoritative index of this project. The actual change request is registered by tasks.mjs before MCP execution-<requestId>; ordinary chat/read-only research only saves the session and does not update the project task index. The task storage scope, source reference and real wheel status have been registered; details are in runtime/. Only update the runtime block marked by root AI_TASKS, and do not allow the model to write rules/indexes.

The runtime record does not copy the chat body; completed means that the dialogue round is over and cannot replace the actual application, business acceptance or release of the page. Non-Git, no branch/submission/main synchronization.

Runtime MCP calls Agent internal POST /internal/register-task before controlled changes, Bearer authenticates and binds the current App Server MCP item fingerprint. Before modification, project_context({modification:true}) returns taskId; read-only without registration; callback failure does not block the operation.
