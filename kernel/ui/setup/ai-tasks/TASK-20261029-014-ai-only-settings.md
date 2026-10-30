# TASK-20261029-014 — AI-only configuration UI

- Executor: Codex/classroom_models_audit;2026-10-29;rules2026-10-15.1.
- Scope: kernel/ui/setup and kernel/localization; detached .worktrees/ai-settings-ui from c926534aa590726e0615bf6aec446c8d7f2d1a86.
- Authority: .worktrees/coordination/AI_TASKS.md and TODO.md, maintained only by root.
- Root registration/reading receipt covers012–015; no release/customer/coremanifest writes by this task.

## Behavior

Wait for a successful state snapshot before mounting project setup. configurationMode ai renders account/API/subscription/import/saved-profile/MCP controls only; legacy missing mode remains setup. Mode stays fixed across mutation replies, including legacy-shaped snapshots missing the discriminator; conflicting/unsupported mode fails without mounting project controls. No ai-mode GETproject, identity/icon form, rename/build/export calls.

Finish validates pending API input while fields remain enabled, saves API then MCP, requires closed:true,handoff:true and stops polling after acknowledged return. Pending login, in-flight operation/language write, failed validation/save/close retain the editor; duplicate clicks share the operation lock. Hidden unsaved API fields return to the form for review rather than being silently skipped. The completion page reports returning to the launcher, not readiness; lifecycle may keep an unchanged running project alive.

English/Chinese titles, saved/default/import/MCP notices and help distinguish AI-only settings from full project setup; connection changes pause owned services until Finish. Error summaries/actions cover mode conflict/invalid, AI-only guard, closing and restart failure with sanitized original details. Existing source/history/native app are retained. Full setup's project/build requirements and existing import/subscription credential behavior remain.

## Validation

54 setup/localization tests passed with0failure/skip; TypeScript and staged setup build passed. Actual setupApp/HTTP/React fixtures exercise mode gating, saves/order, validation beforedisabledfields, pendinglogin, handofffailure, drafts, localization, duplicateFinish, MCPflow and historical fullsetup/subscription regressions. No account login/model call or customer data used. Native process and live browser integration remain parent tasks. Worktree uses a temporary symlink to the same repository's installed kernel dependencies for verification only, removed beforecommit.

## Integration

Cherry-pick the independent scoped commit with service/lifecycle commits; root regenerates/checks the official manifest and carries requested main/customer deployment. Service state/profiles/activate/import snapshots carry configurationMode. Lifecycle owns restart/cleanup; UI never claims services ready from a close acknowledgement. Public help was updated to avoid sending existing-project AI users back to a build/export workflow. No dependency declaration/version changes; kernel stays0.9.8.

Lifecycle handoff follow-up: add the dedicated configure --ai-only CLI help and three AI-only status messages in both languages (preparing, sibling temporary folder cleanup, AI URL/Finish). Full project setup messages remain unchanged. Launcher catalog parity/interpolation and8shared-localization checks passed; no runtime mutation.
