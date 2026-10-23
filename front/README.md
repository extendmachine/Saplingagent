# Saplingagent chat frontend

The starting page provides a right-side conversation panel, independent application content and kernel operation controls. It uses React19.3.0 and assistant-ui0.15.26 with the public Agent HTTP/SSE API. No business dashboards are preloaded.

## Chat controls

- Choose a saved conversation by title/date; titles sort using Chinese pinyin/English and natural numeric order. Refresh reloads history. Rename accepts1–200 characters and saves locally through the Agent. New conversation preserves old history.
- Switch away from a running conversation without cancelling its backend run. Returning restores its snapshot and event stream. The selector becomes available after the snapshot loads; switching never resends a prompt.
- Draft text and attachments remain associated with their own conversation in page memory. Completed uploads reuse their local IDs; unfinished files resume by uploading when their draft is reopened. Page reload/restart restores only the current text draft; unsent attachments need reselection.
- The context meter displays measured tokens and reported capacity when available. It is not a billing meter and does not predict when the provider compresses context. Unknown usage stays unavailable, including providers that do not report capacity.
- Markdown supports GFM tables/task lists and inline/display mathematics, with local KaTeX fonts. Dollar currency remains text. Raw HTML and trusted TeX commands are not enabled.
- Collapse keeps the chat mounted; reopen returns focus to the composer. Drag the edge tab vertically or use its arrow keys to move it. Position storage is optional and contains no conversation content.

Existing file/image attachments, streaming, Stop/Retry, three engine selections, page inspection, restart draft recovery and Full Access remain. Accounts and model entitlement are configured in the independent kernel setup page. This UI does not read secrets or impose filesystem permissions.

## Run and verify

Use `bash Saplingagent.sh` or the exported app from the complete project. Open the actual allocated URL printed by the launcher;5173 is a starting port. For frontend-only development, run `npm ci`, `npm run dev -- --port 5173` in this directory with an Agent on the configured loopback port. Vite proxies `/api` to that Agent.

`npm run build` runs TypeScript and Vite; `npm test` runs isolated frontend/SSE/session regressions. Dependencies/cache/build outputs remain project-local and ignored. Production static output requires a same-origin Agent proxy. Messages persist in backend/workspace; browser storage contains an opaque active-session ID, launcher position and temporary restart text.

See [CONTRACT.md](CONTRACT.md), [SERVICE.md](SERVICE.md), [DEPLOY.md](DEPLOY.md), [REFERENCES.md](REFERENCES.md) and the TASK-20261019-055 handoff.

## Language and Help

Choose English or 中文 in the page header. This updates application UI and owned kernel controls without reloading chat; the saved preference belongs to the project. Help opens the built-in same-origin bilingual guide. If saving the language fails, keep using the page and choose Retry saving language after the service is available. User/model content is never translated. Error details remain available below localized explanations. The interface uses no remote translation service.
