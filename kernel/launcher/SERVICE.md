# Project launcher

Owns customer identity/build/orchestration, not application code or model rights. Entry: kernel/launcher/entry.mjs; HTTP: kernel/services/ai-config public configuration contract; build: build.mjs; native source: native/. Logs are project-local daily project-launcher logs, retained30days; runtime manager retains its own logs. Go compiler/dependencies/cache stay inside .runtime and .cache. Run the native artifact or `bash Saplingagent.sh configure` for management. Restore source explicitly, rebuild only after correcting the reported failure. See CONTRACT.md and REFERENCES.md.

App activation opens the verified runtime gateway's project status page while
services start. The page belongs to runtime-manager; no extra HTTP server,
business service, UI framework or fixed port is added. `status.mjs` formats its
local address, deduplicates opening within a launch and reports browser failures
without stopping a usable runtime. Dependency preparation reports fixed native
progress phases; account/model readiness is not inferred from service startup.

Setup saves all project/AI settings before an explicitly requested offline restart. Canonical external-helper sources and resume adapter are in this directory; only private transient copies run from OS temporary storage outside the app during the move. No credentials are copied outside. After runtime and management readiness, the helper deletes its own temporary files and the page permits native export. Read TASK023 in CONTRACT.md for ownership, failure and cleanup behavior.

Configuration UI preparation is shared in setup-ui.mjs and exported by public.mjs. Script/native/direct-service entry and offline resume verify local assets before opening management; staging publication preserves running pages. It uses the existing project-local Vite dependency and no new process/service beyond the bounded build child. See CONTRACT.md for receipts, build serialization and interrupted-build recovery.
