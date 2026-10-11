# Runtime manager

Owns application child-process lifecycle as the persistent parent launched by `scripts/dev.mjs`. Uses Node built-ins with no new npm dependency. `manager.mjs` supervises owned processes; `server.mjs` provides authenticated lifecycle control; `gateway.mjs` streams same-origin frontend/API/WebSocket traffic and provides the independent recovery page. Tests exercise real synthetic child processes, Git source transitions, HTTP gates, SSE and upgrades.

The gateway at frontPort 5173 and manager control at4314 survive complete restarts. Internal Vite uses vitePort5174. Backends start workspace, builder, optional PDF (only if source exists), then Agent; Agent owns Codex App Server/MCP. Reverse-order shutdown only signals manager-created process groups. Full restart replaces frontend and backend; backend mode keeps frontend. Current checkout source and config are read again; manager code and ports need launcher restart. Busy work refuses preparation and releases acquired gates. Older source without drain support has the limits in CONTRACT.md.

Logs: logs/runtime-manager/runtime-manager-YYYY-MM-DD.log, lifecycle metadata only, 30-day retention. Child diagnostics stay in the terminal. Existing internal token is read from local-secrets; never returned to browsers. This service adds no directory restrictions, root access, automatic rollback, chat resend or inference.
