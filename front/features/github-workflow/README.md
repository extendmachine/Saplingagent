# GitHub-to-Saplingagent workflow prototype

TASK-20261028-001. Optional application-owned React module. Since
TASK-20261028-006, `front/App.tsx` no longer imports or mounts it; the default
page is conversation-only. These instructions describe the retained prototype
when explicitly composed into an application.
It preserves the header, language controller, chat mount and PageContextBridge.
No kernel source, dependency, backend API or persistent process is added.

## Scope and actual behavior

Five local steps: import a GitHub repository link; review an illustrative overview,
license/directory/dependency/issue panels; select capabilities and describe changes;
preview an upgrade plan and delivery placeholder; enter a destination repository
and review the proposed publication checklist. Every screen labels the prototype.

The URL parser accepts HTTPS repository links, `.git`, known repository subpages
including branch/file links, and GitHub SSH clone notation. It normalizes them to
the repository root for this illustrative workflow. It does not resolve a branch,
verify existence, authenticate or fetch contents. Unknown repositories use generic
feature placeholders; the explicitly chosen HyperFrames example uses illustrative
video-tool capabilities, never a fabricated current report or license text.

The requested directory spelling is deliberately `projeccts`. Proposed source and
output paths are `projeccts/<owner>--<repository>/source` and
`projeccts/<owner>--<repository>/saplingagent`. Neither directory is created.
Actual download design must retain the requested ref and resolved source SHA.

Prototype review-state controls demonstrate access-required, unavailable,
unidentified-license and runtime-assessment states. They block moving forward
until the available example is restored; they are not actual repository findings.
Feature dependencies are included automatically; removing the example core clears
dependent preview/export selections. Changing the selected features, name or
improvement text invalidates downstream previews.

Only in-memory prototype state is used; reload starts over. Explicit New project
shows a local reset dialog. It never clears chat, real project files or accounts.
Language uses the existing shared controller and typed English/Chinese keys in
`messages.ts`. Keyboard tabs and feature selection are supported. Container queries
adapt the workspace to desktop, narrow widths and the existing chat panel.

## Publication boundary

A destination equal to the source repository is rejected. Entering another address
does not prove ownership or write permission. The publication summary is a native
dialog with a disabled upload control. It never creates a repository, calls Git,
uploads bytes, runs AI or reports a successful generation/test/publication.
Real integration must check applicable source/component licenses, source refs,
destination contents and permissions, verified output and explicit publication
scope. Arbitrary repository submission does not guarantee full reproduction.

## Verification

Use existing locked frontend dependencies; no added package. `npm run build`
checks TypeScript/Vite. `npm test` covers the existing chat regressions.
`node --test features/github-workflow/model.test.mjs` checks URL trust cases,
source/output separation, dependent selections and both language resources.
Browser checks cover the five steps, invalid URL, review tabs/keyboard, review-state
blocks, selection dependency/empty-selection state, editable plan, destination
checks, disabled upload, reset, English/Chinese and narrow-screen overflow.

Human guide: `docs/github-workflow-prototype.html`. Genuine repository analysis,
generation, licensing decisions, model cost and publication remain unimplemented.
