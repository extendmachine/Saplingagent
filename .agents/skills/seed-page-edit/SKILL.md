---
name: seed-page-edit
description: Create or adapt Saplingagent React pages, components and application features requested in conversation. Implement and verify with current-user file and command tools. Keep research and proposal-only requests read-only.
---

# Saplingagent page evolution

Start with a single page and chat interface. Add what the user requests; do not automatically introduce a canvas, navigation, dashboard or sample features. Normally put application components in `front/features/` and compose them in `front/App.tsx`. Frontend belongs in `front/`, backend in `backend/`, and human documentation in `docs/`. Services communicate through public contracts. These are organizational conventions, not file permission restrictions.

For discussion only, use ordinary `project_context` to inspect goals/rules and remain read-only. For explicit implementation, first attempt `project_context({modification:true})` to register ownership. Registration warnings do not block authorized work; never fabricate a taskId. Read relevant rules and existing code and give the required rules receipt. Read evidence from `preferences_get` when useful, without treating preferences as authorization or a one-time page request as a permanent preference. Never display real credentials in replies or ordinary logs.

The current request authorizes the relevant implementation. Do not repeatedly ask to approve the same action. Decide routine visual details reasonably. Clarify scope for new cloud capabilities, external sending or features whose authorization cannot be inferred. Preserve explicit project approval requirements for tested commits/main synchronization.

1. Read target files with `workspace_read_file`; paths default to the project root and may be absolute, parent-relative or symlinks. Continue large reads using nextOffset. Inspect existing changes before writing.
2. Use `workspace_write_file` directly, and `workspace_run_command` or actual native tools for commands, dependencies and service changes. Chat, main, backend, MCP, Skills and dependencies are writable under the current OS user's permissions; this does not imply root elevation or expanded task authorization.
3. Optionally record a multi-file change through `page_propose` → `page_apply`. `ready` means recorded, not compiled. expectedHash is metadata, not an overwrite gate. Only `applied` confirms the call applied. Direct write/delete snapshots are best-effort: an applied result may include warnings and no changeId, so restoration cannot be promised. Handle actual filesystem errors. After a write timeout/disconnection, inspect state/files before retrying.
4. Run appropriate checks. If browser tools are available, inspect the actual page/chat; otherwise report verified checks and the remaining visual review. Backend/MCP/dependency changes may need a restart. A successful write/build is not human acceptance.

For user-requested restoration, identify the record with `page_changes`, then call `page_rollback`. It overwrites later edits with recorded originals; explain which files were restored. Never automatically roll back. Shell, native-tool, network and business-data side effects are not guaranteed reversible.

Finish with visible results, actual verification and any recorded restoration ID. Keep the response concise and within the requested feature scope.
