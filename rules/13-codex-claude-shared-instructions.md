# 13. Codex and Claude Code Public Specification

## Target

The same project can be maintained by Codex, Claude Code or other AI, but all AI must use the same set of project facts, rules and task status. Do not rely on single dialogues, model memory or tool private records to replace project files.

## The only public rule source

1. `rules/README.md` is the only source of project public control specifications and rule indexes.
2. The root directory `AGENTS.md` is a lightweight entrance to Codex and other AI, which must contain `@rules/README.md` and must-read document guidelines.
3. The root directory `CLAUDE.md` is the entrance to Claude Code. Use `@AGENTS.md` to enter the same rule chain.
4. `AGENTS.md` can be a short prompt dedicated to the AI maintenance project, but it is not allowed to copy the complete public rules, delete the rule entrance or override the public rule priority.
5. When the public control specification is changed, `rules/README.md` and the corresponding rule file should be modified; `AGENTS.md` or `CLAUDE.md` should be modified only when the entrance method changes.
6. The specification version and the last update time are recorded in `rules/README.md`, which is convenient for multiple AIs to identify whether public rules have changed.
7. The default requirements of the global entrance only supplement the items not stipulated in the project; the content stipulated by the project shall be subject to the project rules. Personal Skill provides methods and tool requirements, and does not grant additional operating permissions.

Recommended structure:

```text
project-root/
├── AGENTS.md
├── CLAUDE.md
├── FINAL_GOAL.md
├── TODO.md
├── AI_TASKS.md
└── rules/
    └── README.md
```

## Priority within the project

Under the premise of not violating the rules of the platform system, security restrictions and user permissions, the internal information conflict of the project shall be handled in the following order:

1. The user's clear requirements in the current task.
2. `rules/README.md` and the mandatory rules of its index.
3. Project scope and acceptance standards of `FINAL_GOAL.md`.
4. The scope of the currently claimed tasks in `AI_TASKS.md`.
5. The current microservice `SERVICE.md`, `CONTRACT.md`, `DEPLOY.md` and `REFERENCES.md`.
6. Confirmed progress and to be done in `TODO.md`.
7. Special supplement for non-conflicting items in `AGENTS.md`.
8. AI conversation records, local memory or self-inference.

The scope of difference judgment and suspension uniformly complies with the "Difference and Conflict Handling" of `rules/README.md`. Version changes or outdated records should be verified first; if the substantive conflict of the handling method cannot be determined, the scene will be recorded by the coordinator and request manual confirmation. If it is read-only, it will be reported in the reply.

## Each AI must read before starting the task.

1. Find and read `rules/README.md` completely through `AGENTS.md` or `CLAUDE.md`.
2. `FINAL_GOAL.md`。
3. `TODO.md`。
4. `AI_TASKS.md`; When paralleling, the authoritative index and progress must be read according to Rule 14, and the copy of the current Worktree must not be treated as a real-time state.
5. The description, contract, deployment, reference information and existing task handover documents of the current microservice.
6. `rules/README.md` routed task-related rules.

## Conversation and memory rules

1. It is not assumed that Codex can see Claude Code's chat records, nor does it assume that Claude Code can see Codex's chat records.
2. Do not regard the local memory of any AI as the only factual source of the project.
3. The important decisions, scope, verification results and the next step of the modification task must be written into the task record and summarized by the coordinator; only read and review the output results according to the rules index, and do not write documents for memory requirements.
4. Before continuing to modify, the run session should re-read `rules/README.md` and the authority `TODO.md` and `AI_TASKS.md` located in Rule 14 to prevent other AIs from updating the rules or task status.
5. Before submitting, you must read the authority `AI_TASKS.md` again and check the Git status to confirm that it has not crossed the claim range of other tasks.
6. All AI must use rules/README.md for reading receipts and include its eight-field completion-review receipt in every final conversational reply, including read-only work. Read-only work remains unregistered and does not create files. Do not replace actual readings/checks with chat memory or fabricate receipt fields.
7. The standard version, task number and applicable rules in the receipt must come from the current project file and must not be copied according to the reply of other AI.

## Special configuration for tools

1. Tool configurations in `.codex/` and `.claude/` shall not be the only storage location for business rules.
2. You can submit a project configuration that clearly needs to be shared by the team and does not contain sensitive information.
3. Local permissions, session status, cache, personal memory and configurations containing local paths cannot be submitted.
4. When an AI lacks the required tools or permissions, it must clearly record the unfinished items and must not claim to have been executed.
