# 18. Saplingagent folder boundary and customer autonomy

## Maintainer development and source delivery

1. Work on Saplingagent's code only inside its project folder, including development worktrees beneath it. Do not modify code in sibling repositories, external folders or global installations to implement or fix this product.
2. Deliver all project-owned application code, frontend/backend modules, MCP, Skills, rules, configuration, dependency declarations, documentation and launcher helpers inside one complete application folder. Do not require another developer checkout, a fixed developer path or an external source symlink. The one launcher depends on these accompanying files.
3. Dependencies downloaded by the installer, caches, runtime state and customer credentials belong to the recipient's own application folder. The source package is not an offline bundle of model weights, macOS system tools or all installed dependencies; declared remote model APIs and official dependency downloads remain external services.
4. Exclude private credentials, conversations, real logs, installed runtimes/dependencies, caches, Git/worktree metadata and developer acceptance records from default source delivery. Initialize the recipient's own goal and task records. Source packaging checks the committed source and all rules; customer data export is separate.

## Customer conversation guidance, not a technical permission boundary

1. Recommend keeping ordinary application edits, new components and backend features inside the active application's folder. By default, do not change unrelated external code or another project's environment just because a tool can reach it.
2. A customer's explicit request to edit an identified external project or file can override this default recommendation. Follow the scope actually requested; technical capability alone is not task authorization. Do not invent a second per-operation approval flow for already authorized work.
3. Keep current-OS-user Full Access for native tools, MCP, backend/frontend, dependencies, configuration and Skills. This rule introduces no path allowlist, protected directory, sandbox, mandatory compilation gate, permission interceptor or automatic rollback. OS permissions and platform/external-service constraints still apply; Full Access is not root.
4. The maintainer development/delivery boundary and the customer's authorized work scope are different. Shipping Saplingagent must not depend on modifying external code; a recipient can still explicitly use their Agent to work on external code.

## Every conversational turn

Every final assistant reply must include the eight-field completion-review receipt from rules/README.md, including ordinary chat, clarification, research and read-only review. Use the user's language. Read-only turns stay read-only and unregistered: state no files changed, no document update needed, Git unchanged/not applicable and only the checks actually performed. Do not invent task IDs, rule readings, commits, tests, human acceptance or success to fill the template.

A receipt is an account of the work, not a permission gate. If a turn is interrupted or fails before the model can provide a final reply, disclose that limitation when a reply is possible; do not fabricate a completed receipt or silently retry the user's request. The model is instructed to follow the format; there is no answer-rewriting or tool-blocking middleware.

Explicit user instructions have the precedence defined in rules/README.md. Existing exact-version human acceptance, Git synchronization and publication requirements continue to apply.
