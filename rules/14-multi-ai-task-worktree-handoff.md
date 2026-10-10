# 14. Multi-AI task claim, Worktree and handover

## Target

Codex, Claude Code and multiple parallel conversations must collaborate without overwriting each other's modifications. Each task needs to clearly execute AI, modification scope, branch, Worktree, status and handover record.

Read-only tasks are executed according to `rules/README.md`, do not create claim records, and do not trigger the handover file writing requirements. The following registration and isolation processes are applicable to modifying tasks.

## Authoritative index and coordinator

1. When a single task is not enabled for parallel coordination, `AI_TASKS.md` and `TODO.md` in the root directory of the current project are authoritative records, and the implementation of AI also assumes the responsibilities of the coordinator.
2. Before the Git project starts parallel modification, the main execution AI establishes an independent coordinated Worktree in `.worktrees/coordination/` in the root directory of the original project and uses the `chore/project/task-coordination` branch. `AI_TASKS.md` and `TODO.md` in this directory become the only real-time claim index and overall progress; this branch only maintains coordination records and does not modify business codes.
3. The root directory of the original project is located from the main working directory of `git worktree list --porcelain`. Check the above coordination directory before each claim, continuation and end; once it exists, read the authoritative records in it, and you can't judge that it is unoccupied by the snapshot in the current Worktree alone. When the path does not match, clone independently or cannot access the authoritative directory, verify the location first; do not build another parallel index.
4. The coordinator registers his identity, coordination position and task scope before starting other tasks. When there is already a coordination Worktree or coordinator, read it first and follow it; do not overwrite or rebuild the existing directory when the occupancy error occurs in the concurrent creation.
5. Authoritative `AI_TASKS.md` and `TODO.md` are only serially modified by the coordinator. Claim requests that have not been registered should be submitted through available collaboration channels first, and no handover documents should be created first; after the claim enters the authoritative index, the execution of AI can modify the corresponding scope and maintain its own task records. Summary of progress, verification results and submission to be tested to notify the coordinator; the new record after the candidate branch is frozen will directly enter the coordination record according to Rule 04, and the task file in the candidate branch will no longer be changed.
6. Updating the project-level index does not require other tasks to hand over business documents to the coordinator. The root status file in the ordinary Worktree is a submitted snapshot, and the AI reads the authoritative record to continue its own task, and does not send back to write these shared snapshots.
7. When the coordinator summarizes, re-read the latest documents and only modify the relevant task records; the coordinator's changes must be recorded and handed over, and other AIs must not occupy them by themselves. When the registration cannot be completed, only the scope of new modification is suspended, and the work that is not affected by the read-only analysis or the scope of the claim can continue.
8. Non-Git projects use the same index and a single coordinator in the root directory of the project, and overlapping modifications must be serialized. When the coordination capability is not available, it is processed according to serial tasks, and there is no need to simulate parallel multiple indexes.
9. When the coordination record enters the main, create an independent document from the coordination branch according to rule 04 to deliver snapshots and conduct manual review; the real-time coordination branch continues to maintain the status. The coordination directory is not a sensitive information directory, and the credentials shall not be saved; it shall not be copied to other items with the specification package.

## Claim the task

1. Before AI modification, you must position above and read the authoritative `AI_TASKS.md`, and read the goals, rules and related task records of the current Worktree.
2. The new task must be a unique task number, such as `TASK-20260726-001`.
3. The coordinator must register to perform AI, microservice or project-level functions, allow modification scope, prohibit modification scope, branch, Worktree and status. The single task is carried out by the execution AI to complete the minimum registration by itself, and then send the receipt according to the rule index.
4. A task can only have one main execution AI; when AI needs to be changed, the handover must be completed first.
5. If there is an ongoing task occupying the same file, directory, interface or database structure, first check the actual scope and coordinate the splitting; the real overlapping scope shall not be modified before the handover, and other independent scopes can continue.
6. When a task involves multiple microservices, it should be disassembled into multiple task numbers according to the microservice.

## Branches are isolated from Worktree

1. Each task corresponds to a unique number; the same AI conversation can handle multiple tasks in order, and cross-service tasks are still numbered separately. Do not mix the scope of tasks by following the dialogue.
2. Git modification tasks correspond to independent features, repairs or project-level record branches; when there is no Git repository, it is truthfully marked as "not applicable".
3. Tasks performed in parallel in the Git project must use independent Worktree.
4. It is recommended to put the project Worktree in `.worktrees/<task-id>/` in the root directory of the project, and add `.worktrees/` to `.gitignore`.
5. Two AIs are not allowed to use the same Worktree, the same feature branch or the same unsubmitted work directory at the same time.
6. When there is no Git repository, multiple AIs are not allowed to modify the overlapping range at the same time; it must be processed serially and occupied by the coordinator in the authoritative `AI_TASKS.md` tag.
7. Branch submission, manual testing and synchronous `main` continue to comply with `rules/04-git-branching-by-service.md`.

## Handover documents

Each task that needs to be continued across AI or cross-dialogue must be established in the corresponding microservice directory:

```text
services/
└── service-name/
    └── ai-tasks/
        └── TASK-YYYYMMDD-001.md
```

Parallel execution AI uses the above task files in their respective services to save the progress for the coordinator to summarize. For project-level tasks without microservices, the coordinator shall save equivalent information in the "Project-level Task Record" block of the authoritative index, and false services will not be created for handover. After the candidate branch is frozen, the follow-up progress and handover will be added to the coordination record, and the frozen service task file will not be modified.

The handover documents must include:

1. Task number, execution AI and creation time.
2. The original target and acceptance conditions.
3. Branch, Worktree and the latest submission number.
4. Modified documents and documents that are explicitly prohibited from modification.
5. Key design decisions and reasons.
6. The executed inspection and actual results.
7. The content, risks and blocking points have not been verified.
8. Matters that the user has confirmed or has not yet confirmed.
9. The official reference website that has been used.
10. The specific steps that the next AI should take.

The handover file is directly created in the following format:

```markdown
# <TASK-ID> Task handover

- Execution AI: <Codex / Claude Code / Other>
- Microservice: `<SERVICE_NAME>`
- Creation time: <YYYY-MM-DD HH:mm>
- Branch: `<BRANCH>`
- Worktree：`<PATH>`
- Authoritative index: `<path relative to the root directory of the original project>`
- Coordinator: <Execute AI and coordinate task number>
- Latest submission: `<COMMIT-OR-NONE>`
- Current status: <Status>

## Original target and acceptance conditions

<Content>

## Modify the scope

- Modified: <File>
- Allowed to modify: <Scope>
- Modification is prohibited: <Scope>

## The key decision

<Decision and reason>

## The inspection has been carried out

<Commands, steps and actual results>

## Unverified, risk and blockage

<Content>

## User confirmation situation

<Confirmed or pending matters>

## Official information

<Name, website and purpose>

## The specific steps of the next AI

1. <Steps>
```

## Handover process

1. The original execution AI first stops the modification of the current handover scope, updates the handover documents, and the coordinator summarizes the authoritative `AI_TASKS.md` and `TODO.md`; the handover supplement of the frozen candidate branch is only written to the coordination record.
2. The original execution AI must submit the content that can be handed over; if it cannot be submitted, the documents and reasons for not being submitted should be explained.
3. Before the new execution AI takes over, you must check the handover file, branch, submission number, Worktree and actual Git status.
4. After the coordinator updates the execution AI and the takeover time of the authority `AI_TASKS.md`, the new execution AI is allowed to continue to modify; the new execution AI of a single task assumes the role of the coordinator after verification and handover.
5. If the actual file status is inconsistent with the handover record, check the code, submission and record first, and deal with the differences according to the rule index; only the part affected by the unresolved substantive conflict is suspended, and no guess or overwrite according to the chat content.

## Parallel update protection

1. Before modifying the shared file, you must check its latest content again.
2. `rules/README.md`, detailed rules, `AGENTS.md`, `FINAL_GOAL.md`, `TODO.md`, `AI_TASKS.md`, public interface contract and database structure are high conflict files.
3. The authoritative `AI_TASKS.md` and `TODO.md` are serially maintained by the coordinator; the rest of the high conflict files are carried out by the registered task owner who is responsible for the file. Other AIs put forward pending tasks in their own task records and notify the person in charge, which cannot be directly covered.
4. Before submission, it is necessary to check whether there are new modifications of other AI, and the content that does not belong to the current task must not be submitted together.
5. When you find overwriting, conflict or unknown source modifications, keep the scene and check the source; according to the rule index judgment, the substantive conflict that cannot be resolved should be requested for manual confirmation, and other people's content shall not be rolled back.

## Complete and archive

1. After the implementation, relevant documents and executable self-tests are completed, record the "realization and self-inspection completed"; after preparing for manual delivery, the coordinator will mark "to be tested manually" and record the frozen submissions to be tested.
2. After the user confirms that the test has passed, AI will synchronize to `main` according to Git rules.
3. After the synchronization is completed, record the `main` merge submission and change the task status to "synchronized main".
4. The handover documents are reserved for tracing; after confirming that there is no need to continue work, it can be changed to "archived" and the review record cannot be deleted directly.
5. Read-only tasks are directly reported to be completed; non-Git document tasks can be registered as "completed" or "archived" after meeting the completion conditions of rule 09. Git document branches still need manual confirmation to enter the main, and archiving cannot replace acceptance or consolidation.
