# 09. Manual collaborative verification and task boundaries

## Target

The modified testing and confirmation of microservices are completed by AI and manual cooperation. AI does not specifically create a test entrance to avoid the test data interfering with the project itself. AI must write the verification situation, the reason for non-verification and subsequent human confirmation matters into `TODO.md`.

## Saplingagent maintainer workflow

For the owner-authorized direct-main workflow in rule04 (2026-10-12), per-version human testing and merge confirmation are optional rather than a synchronization prerequisite. Complete available self-checks, report unverified matters and synchronize authorized work to main directly. Self-checks do not establish human acceptance; record the owner authorization and actual verification separately. This exception applies only to the maintainer repository, not inherited customer permission. Other requirements and historical human test records remain intact.

## Manual collaborative verification

1. After the modification is completed, AI should explain which microservices are involved this time.
2. AI does not force the creation of new test entrances or test data.
3. AI first completes the existing inspections that are proportionate with the changes and will not pollute the business data, such as static inspection, construction, document consistency inspection and isolated existing tests; the real business operation process continues to collaborate with human verification. Do not omit the inspection that can be completed independently because of the need for human acceptance.
4. When the verification is not completed, the reason must be recorded in `TODO.md`.
5. Do not merge the microservice branch into `main` until the human confirmation is completed.
6. After AI completes the branch, it must give the source branch, the commit SHA to be tested, the test steps and the expected results to the user.
7. After the user tests and confirms that the specified commit is approved, AI is responsible for synchronizing to `main`, and the user does not need to manage the feature branch.
8. When the content of the branch changes after the test, it must be resubmitted and the manual test must be carried out again.
9. Multi-AI tasks must indicate the execution of AI, task number, branch and Worktree; human confirmation must be clearly submitted.

## TODO modification record

After each AI modification, the latest record summarized to `TODO.md` according to rule 14 should contain the following; read-only tasks do not write documents for record requirements:

1. Modify the time.
2. Modify the goal.
3. It involves microservices or standard documents.
4. The content has been completed.
5. Verify the situation.
6. Unfinished matters or contents that need to be confirmed manually.
7. Source branches to be tested or have been tested and the commit SHA.
8. The merge commit SHA after synchronization to `main`.
9. Perform AI, task number and handover document location.

## Mission boundary

1. AI can only be modified around the current goal.
2. When additional optimization points are found, do not change them directly, but record the follow-up suggestions of `TODO.md` first.
3. When multiple microservices are involved, they must be split and processed.
4. When the user clearly changes the target, scope or acceptance conditions, AI should update `FINAL_GOAL.md` synchronously and continue the authorized work. The scope expansion proposed by AI must be confirmed manually, and authorization shall not be obtained by modifying the target file by itself.

## Completion status

1. Realization and self-inspection completion: The implementation, relevant documents and executable inspections within the scope of authorization have been completed, but it does not represent human acceptance or main synchronous completion.
2. To be tested manually: deliver the frozen source branch, commit SHA, manual steps and expected results. Self-examination does not replace human confirmation.
3. The test passed the synchronization and synchronized main: record the user confirmation and actual merge results according to rule 04; continue to retest according to rule 04 after submitting the changes.
4. Read-only tasks can be terminated after the report covers user requirements, without task registration, Git commit or fictitious human testing; when non-Git document tasks complete document inspection and there are no agreed pending acceptance items, they can be marked as completed or archived.
5. The document modification of the Git project is still submitted in the corresponding feature branch. Before entering the main, it is still necessary to manually review and confirm the specified commit. Inapplicable business test steps should be explained, and the merger approval should not be bypassed by the "document task".
6. The final delivery explains the items that have been completed, not verified and waiting for the user respectively; continue to be processed when there is authorized work that can still be completed independently, and do not use "to be tested manually" as a reason to return the incomplete implementation in advance.
