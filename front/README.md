# Saplingagent chat frontend

The starting page provides a right-side conversation panel, independent application content and a compact Settings link to project runtime management. It uses React19.3.0 and assistant-ui0.15.26 with the public Agent HTTP/SSE API. No business dashboards are preloaded.

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

## GitHub application workflow prototype

The source retains an optional five-step GitHub workflow prototype, which is
not imported or mounted by the default conversation-only page: import, understand, select, upgrade and publish. All repository reports
and generation/delivery views are explicitly illustrative; the module performs no
download, inference, project creation or destination upload. It retains the shared
language/header/chat/page bridge. See [module behavior](features/github-workflow/README.md)
and [interactive prototype guide](../docs/github-workflow-prototype.html).

## Language and Help

Choose English or 中文 in the page header. This updates application UI without reloading chat; the saved preference belongs to the project. Independently opened management pages load that project preference. Settings opens the same-origin runtime page in a new tab so chat drafts, attachments and live replies remain in the original tab. Help is available inside Settings and opens the built-in same-origin bilingual guide in the current project language; the chat header no longer repeats this link. If saving the language fails, keep using the page and choose Retry saving language after the service is available. User/model content is never translated. Error details remain available below localized explanations. The interface uses no remote translation service.

## Choose a Codex account model

With a Codex account, use the chat model picker and **Refresh models** to read the
App Server catalog. **Automatic** uses the resolved project default. An explicit
selection stays selected when refreshing; a missing model is marked unavailable.
Retry a failed/stale catalog before applying or sending an explicit model choice.
Catalog presence is not proof of account access or quota.

Existing conversations use **Apply**, keeping their messages, text and attachments.
Choosing or refreshing never sends a model prompt. Fixed API profiles show the
configured model instead of an account picker; edit that scheme in Settings. If
an old account selection differs, **Use API profile model** stages an explicit
reset for Apply. The compact **Last confirmed model** comes only from a server
observation for this conversation and may describe an earlier request; a preference
or configured default is never substituted when actual usage was not reported.
