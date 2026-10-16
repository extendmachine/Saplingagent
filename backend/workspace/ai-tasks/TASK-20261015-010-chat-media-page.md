# TASK-20261015-010 — Opaque local attachment storage and optional message metadata

- Executor/coordinator: Codex/root,2026-10-15.
- Source: detached .worktrees/chat-media-page from main490613b. No new named branch.
- Authoritative index: original-root .worktrees/coordination/AI_TASKS.md and TODO.md.
- Scope: contracts/attachments.mjs plus backend/workspace/; other service changes have separate010–015 commits. Root pending task records/config, release/adobe and other projects are excluded.
- Goal: user-authorized chat file/image selection, drop/paste and AI inspection of the freshly rendered modified project page without extra own-project read permissions.
- Decisions: persist originals in ignored data/attachments with UUIDs; use existing service APIs and native image input; current frontend answers fresh page_read with DOM/layout and optional DOM-rendered PNG. No new persistent service, browser executable, OS screen capture, extra permission gate, credential migration or paid inference.
- Verification: 10 workspace tests pass, including real HTTP authentication/download, image signature detection, restart persistence, idempotence, malformed/corrupt storage and legacy sessions.
- Limits: synthetic model reply/transport checks do not establish actual model/account image support. Clipboard must expose file bytes; ordinary text/file paths stay text. Only connected project entries participate; standalone entries need PageContextBridge. DOM-image external/frame/canvas/font limitations are reported, not hidden. Human acceptance is not claimed; Windows native drag/paste remains unverified on this macOS host.
- Sources: affected service REFERENCES.md; exact pinned installed native SDK/schema types. Storage/broker use Node built-ins.
- Evidence: original-root ignored .cache/chat-media-page/*-tests.log, front-build.log, browser-proof.png, before-change.json/png, after-change.json/png and final-page.json/png. No fixture data/build/dependencies/logs enter Git.
- Latest source/main SHAs and final result are recorded by the coordinator after freezing; do not modify this file to backfill its own SHA.
- Authorization: owner standing main merge/push instruction under rule04; main only. No human acceptance was supplied for this version.
- Next: verify source/main SHAs in the authoritative index. For local use start the normal launcher, then Restart app/reload to load updated backends/MCP/frontend. Select/drop/paste files and ask the Agent to inspect the open page after a UI change. Preserve sessions plus attachments when backing up or switching to older writers.
