# TASK-20261019-058 — Integrate the right-hand chat into main

Executor: Codex/root; independent reviewer: status_audit. Rules start/end `2026-10-15.1`. Authoritative index: maintainer `.worktrees/coordination/`. Base main: `b14eb1689196c2181d68c276feab3c81251eeb4c`. Candidate: detached `.worktrees/chat-import-integration`.

## Scope and provenance

The owner requests the right-hand chat capabilities from the existing coursework application, including token display and conversation switching, in maintainer main. The source application's files were read only. Its business workspace/editor/email features, real sessions, credentials, runtime configuration and kernel overlays were not copied.

Independent service sources:

- Workspace TASK057: `e513629197bf7d2623b41cd32ae27a85775650ca`, integrated as `55454f8`.
- Agent TASK056: `fe42c848323b1377ebb359a9a659a10190c703f2`, integrated as `5175680`.
- Agent test maintenance: `ca89d05358cd76b743e6861748e48b65401aadcb`, integrated as `a2e5797`.
- Frontend TASK055: `b41b8f71c7c98545eac183ce5865c68463a1b6c0`, integrated as `a1e0e33`.

Shared API/HTML documentation and both README editions describe the resulting chat. Kernel remains **0.9.5** and its source/manifest are unchanged. Release and Adobe are outside this task. The owner's standing main authorization applies; no new human acceptance is claimed.

## Result and edge cases

The right-side dock now has naturally sorted conversation history, refresh, switch, rename and new-conversation controls; separate in-page text/attachment drafts; a context usage gauge; GFM/math Markdown; and a draggable collapsed opener with remembered position. Main's attachment transport, page capture bridge, model selection, tools, cancellation, reconnect/retry, accessibility/focus and separate kernel controls are retained.

Session snapshots persist valid latest Codex usage and distinguish missing/null data. The UI never infers billing totals, unknown provider limits or automatic compaction timing. A running conversation can be left and reentered without blocking navigation until its turn ends. Late events, history loads, cancellation/approval responses and rename results cannot overwrite the selected conversation. Failed restart-time switches restore the source draft; an already-submitted attachment upload must finish before switching. Completed upload descriptors retain the same attachment ID when drafts move between sessions. This is in-page draft preservation, not a new promise of attachment recovery after a browser crash.

## Verification and evidence

Using the project-local official Node24.21.0 distribution:

- `node --test backend/workspace/test/*.test.mjs backend/agent-runtime/test/*.test.mjs`: **47 passed**, zero failed/skipped.
- `npm test --prefix front`: **54 passed**, zero failed/skipped.
- `npm run build --prefix front`: TypeScript and Vite passed. Existing large-JavaScript-chunk warning remains; local math fonts add assets.
- All **226** kernel manifest entries match their declared size/SHA256; kernel version0.9.5.
- Independent source review cleared the final frontend/Agent/Workspace implementation, including draft ownership, pending uploads, concurrent rename and explicit-null persistence.

The first full backend run had46pass/1fail because an older release HTTP test hardcoded0.9.4 against the actual0.9.5 manifest. The test-only follow-up uses a valid synthetic manifest with two independent version values and checks that the endpoint rereads it. It changes no production version.

Isolated browser preview uses the built candidate frontend, actual Agent/Workspace/Builder HTTP services and a synthetic Codex event source. No real model or account is called; no customer process is changed. Same-origin authorization, streamed usage, title-only rename, invalid-title rejection and saved JSON were checked against actual services. Early manual fixture probes lacked an Origin header and used an incorrect storage path; correcting the test invocation gave the expected behavior, without product changes.

Real browser checks passed: formula/table rendering, known/unknown/near-capacity display, rename followed by reload, text plus an uploaded file switching away/back, sending that restored attachment, persisted message/usage on reload, leaving/reentering a running response and stopping it, immediate first-turn history entry, collapse/open and drag position surviving reload. The opener intentionally returns to the default expanded dock on reload; its saved position is used when collapsed again. Browser console reported no errors/warnings.

Local ignored evidence is under `.cache/chat-preview/`: final backend/frontend test logs, build log, HTTP evidence, preview address and `chat-main-preview.png`. Preview kernel controls are explicitly a display-only fixture; real kernel restart and native Windows UI were not tested in this chat task. Actual provider login/model inference and owner acceptance remain unverified. The final main SHA and push result belong in the live authoritative index after synchronization.

## Completion-review receipt

- Standard version: start/end `2026-10-15.1`.
- Task attribution: TASK055–058, coordinated by Codex/root; implementation and isolated verification complete.
- Actual modification scope: application frontend, Agent, Workspace, their tests/contracts/handoffs and shared docs.
- Rule review: public README plus 02,04,07,09,11,12,14,18 and task-specific dependencies/boundaries.
- Document status: service and shared API docs, READMEs and this handoff synchronized.
- Verification status:101 automated tests, build, real browser/synthetic-engine integration, manifest integrity and independent review passed; no human acceptance or real model claim.
- Git status: independent detached service commits integrated; main synchronization authorized, final result tracked in live authority. Existing three root pending records are excluded.
- Remaining items: final main synchronization/push and exact remote verification; optional owner testing with their real provider.
