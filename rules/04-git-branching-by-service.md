# 04. Git branch, test confirmation and main synchronization

## Target

Git branches must be divided by microservices and features. AI is responsible for creating, maintaining, submitting and sorting out all microservice branches and feature branches; users mainly review and use `main`, and take charge of human testing and confirmation after the completion of the branch.

Any content entering `main` must be traced back to the source branch and the submitted version actually tested by the user to prevent the test version from being inconsistent with the merged version.

When multiple AIs or multiple dialogues work in parallel, `rules/14-multi-ai-task-worktree-handoff.md` must also be followed. A task uses an independent branch and an independent Worktree.

The commit, test version and main synchronization process of this file are applicable to the modification tasks of the Git project. Read-only tasks and non-Git document tasks are delivered according to Rule 09, and no fictitious branches or commits are created for the process.

## Saplingagent owner-authorized maintainer exception (2026-10-12)

The owner of extendmachine/Saplingagent explicitly instructed AI to synchronize future work directly to main without another confirmation. For authorized changes in this maintainer repository, complete appropriate self-checks, document/sensitive-file review and source traceability, then merge and push main without asking the owner to approve the commit again. This applies to the current Git storage candidate and subsequent authorized tasks until the owner changes the instruction.

This explicit owner instruction supersedes this rule's mandatory per-version human test/merge confirmation for this maintainer main workflow. Use independent service/project commits and preserve source history. Record actual self-checks, source SHA, task ID and the standing owner authorization; record human acceptance as not performed when no human test result was supplied. Do not mark Validated-By:user merely because the owner waived confirmation. Resolve ordinary conflicts within authorized scope and rerun affected checks; ask only when a genuine unresolved scope or data conflict requires owner input.

Other branches are synchronized only when requested. This authorization does not grant customer repositories permission to publish to the author repository, nor authorize unrelated releases, deployments or destructive actions. Recipient projects follow their own user's instructions. Historical acceptance records remain unchanged. The generic confirmation workflow below remains the default outside this explicitly authorized maintainer case.

## Saplingagent main-first development and release showcase (2026-10-15)

The maintainer explicitly assigns these roles to the original Saplingagent repository:

1. `main` is the owner's development and testing branch. Prepare shared changes from main, perform appropriate checks, and merge/push main first under the existing owner authorization.
2. `release` is the GitHub default branch, public project introduction and customer source/distribution branch. A requested release synchronization follows the checked main change; do not implement shared fixes on release first or treat release as the development workspace.
3. An explicit main-only request stops after updating main. Publishing release is still a scoped action; do not silently synchronize it while the owner is testing main.
4. Demo videos, playback embeds, presentation case tables, case screenshots and community showcase images belong only to release. Main may link to the corresponding release introduction, but must not duplicate those showcase blocks/assets. Shared branding, application assets and technical-guide illustrations needed for development are retained on main.
5. For a release-only presentation change, establish its task/scope against main first, then edit the release presentation directly within the requested publication scope; do not stage duplicate media on main merely to satisfy the ordering rule.
6. When promoting shared code from main to release, preserve release-specific presentation files and materials. Integrate the reviewed change deliberately; never reset release to main or copy the whole main README/assets tree over it. Record the main source commit, release result and checks. Existing branch-specific runtime differences remain until included in an authorized promotion.
7. Keep only `main`, `adobe-replica` and `release` as named branches, retain history, and use detached candidate worktrees where needed. Adobe experiments synchronize only when requested. These maintainer conventions do not change a recipient project's own Git ownership or permissions.

## Branch type and naming

1. `main`: the development integration branch. In the original Saplingagent repository it is the owner’s development/testing code, with the maintainer authorization and promotion policy above.
2. Microservice long-term branch: It is recommended to use `service/<service-name>` to collect the modifications that the microservice has been completed but has not yet entered `main`.
3. Feature branch: It is recommended to use `feature/<service-name>/<feature-name>` for single function development.
4. Repair branch: It is recommended to use `fix/<service-name>/<issue-name>` for single problem repair.
5. It can be used when the project has other naming rules, but the branch name must be able to identify the microservice to which it belongs and the modified content.
6. When creating a new microservice, AI must create or plan the corresponding microservice branch synchronously.
7. Specifications, documents and coordination tasks that do not belong to microservices can use identifiable project-level branches such as `chore/project/<task-name>`; only maintain the corresponding project-level content, and do not mix business changes with multiple services.

## Branch management in charge of AI

1. Identify the microservices involved before modification, and switch or create the corresponding branch.
2. After the development content is completed, first maintain the instructions, interface, deployment documents and task records of the service, and then submit them to the corresponding branch; the root progress is summarized by the coordinator according to rule 14.
3. Perform document screening, sensitive information check and modification scope check before commit.
4. AI is responsible for recording the purpose, status, latest commit and microservices of each characteristic branch. Users do not need to manage these branches on a daily basis.
5. The same feature branch shall not be mixed with other microservices or modifications of unrelated tasks.
6. After the branch enters the state to be tested, AI shall not continue to modify the commit to be tested; if it needs to be modified, a new commit must be generated and the user must be notified for testing again.
7. The feature branch that has been confirmed and synchronized to `main` is retained, archived or cleaned up by AI according to the needs of the project; it is still necessary to comply with the branch protection requirements of the project before deletion.
8. When the project configures a remote repository, AI should push the completed branch to be tested to the corresponding remote branch; when there is no remote repository, it should be kept locally and clearly specified.

## Branch management list

The coordinator must maintain the "Git Branch Management" block in the authoritative `TODO.md` and record at least the following information; the single task is carried out by the executive AI coordinator:

1. Branch name.
2. It belongs to microservices and functions.
3. The actual commit SHA that has been recorded recently, and the currently frozen commit SHA to be tested (if any); it is not required that the commit where the document is recorded contains its own SHA.
4. Current status: under development, implementation and self-test completed, pending human testing, failed test, test passed to be synchronized, synchronized `main` or archived.
5. The corresponding `main` merge commit SHA; fill in "none" when it has not been synchronized.
6. Finally, update the time and the next step.
7. Execute AI, task number and Worktree location.

## Delivery information after completion

After AI completes the branch content, the following information must be provided to the user, and the following freezing rules must be summarized to the authoritative `TODO.md`:

1. Source branch name.
2. The complete or uniquely identifiable commit SHA to be tested.
3. The content of this revision and the microservices involved.
4. The test steps and expected results that the user needs to perform.
5. Unverified risks or precautions.
6. When delivering human acceptance, the status is marked as "to be manually tested"; it can indicate that the implementation and self-inspection have been completed, but it cannot be claimed that the human acceptance has passed or has entered `main`.

## Freeze version and record commit

1. First, complete the implementation of the candidate branch, the documents and self-test that should be delivered with the version, and then obtain the final commit SHA. The SHA is the frozen version of the user's actual test, which must be given in the delivery receipt.
2. After freezing, do not modify the candidate branch again for backfilling SHA, manual results or progress. First deliver the receipt record, and then the coordinator writes into the unfrozen coordination branches `TODO.md` and `AI_TASKS.md`; if necessary, a single AI can also establish an in-project coordination Worktree according to rule 14 and serve as the coordinator by itself.
3. The record commit tracking is clearly indicated candidate commits or merge commits, and it is not required to write back the record commit's own SHA. The version to be tested, the manual result and the main merge number are recorded separately.
4. When the coordination record needs to enter the main, create an independent project-level document from the coordination branch to deliver the branch and freeze its snapshot; it still needs to be manually reviewed to confirm the commit. Real-time coordination branch continues to record tasks, and does not directly use the continuously updated index as a frozen candidate.
5. This rule only distinguishes the location of the record and does not exempt retest: any commit changes in the candidate branch after testing must still be retested and confirmed; documents or metadata commits shall not be quietly attached to the approved version.

## User test and confirmation

1. Users should test the source branch and commit SHA specified by AI.
2. After the user feedback test is passed, AI must confirm that the commit of the user test is still ready to be merged.
3. If the branch to be merged is added, rewritten or changed after testing, the original test result is invalid and must be retested and confirmed.
4. When the test fails, AI will continue to process in the original feature branch or the corresponding repair branch, and shall not synchronize the failed content to `main`.
5. Users only need to give confirmation of the test results and whether to allow synchronization to `main`, and AI is responsible for the specific branch operation.

## The rules of synchronization to main

1. Only after the user clearly confirms that the specified commit test has passed, AI may synchronize it to `main`.
2. Before synchronization, update the local `main` to check the compatibility of the source branch with the latest `main`; if there is a conflict or actual code changes, the user must be asked to test again after resolution.
3. Each synchronization to `main` can only contain one microservice or feature range that can be reviewed independently.
4. The merger should keep a clear source record. The merge commit instructions include at least:

```text
Source-Branch: feature/service-name/feature-name
Tested-Commit: <Commit number of the user's actual test pass>
Validated-By: user
Agent: Codex / Claude-Code / other
Task-ID: TASK-YYYYMMDD-001
```

5. It is recommended to use the method of retaining the merged commit to synchronize to avoid the loss of source branch information due to compressed commit.
6. After the synchronization is completed, AI must hand over the merge commit SHA, source branch, tested commit and synchronization time of `main` to the coordinator, and write to the authoritative `TODO.md` that has not been frozen the coordination branch; do not directly submit unreviewed record modifications in main.
7. Without user confirmation, AI shall not merge by itself, merge after rebase, or push to `main`.
8. When the project configures the remote repository, AI is responsible for pushing `main` to the remote after local synchronization is completed and checking for errors; users do not need to manually process feature branches.

## Multi-service changes

When a task involves multiple microservices, it must be split by service:

1. Each microservice uses its own branch and commit.
2. Provide the test version to users separately.
3. Obtain the confirmation of human testing separately.
4. Synchronize to `main` separately, and keep their respective source branches and tested commit tags each time.

## Abnormal situation

1. Emergency repair must also use independent repair branches and keep the source mark, and it is not allowed to develop directly in `main`.
2. If it is found that `main` contains untested commits, you should immediately stop continuing to synchronize, record the situation in `TODO.md` and wait for manual decision on the processing method.
3. If the source branch no longer exists but still needs to be synchronized, AI must first restore the traceable branch or clearly correspond to the commit, and must not merge by memory.
