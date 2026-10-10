# 02. Git pre-commit document screening

## Target

Before each commit of git, you must do a review pass to prevent sensitive files, temporary files, irrelevant large files or expired documents from entering the repository.

## Checklist before commit

1. Check whether the file to be submitted contains sensitive files, such as passwords, keys, local sensitive information folders, `selfdata.json`.
2. Check whether temporary files, debugging files, build artifacts, and irrelevant large files have been added by mistake.
3. CHECK WHETHER THE README, INTERFACE DOCUMENT AND CONFIGURATION INSTRUCTIONS ARE CONSISTENT WITH THIS CODE CHANGE.
4. Check whether `.gitignore` covers logs, environment variables, server information, temporary files and other content that should not be submitted.
5. Confirm that this commit only contains the content related to the current task.
6. Confirm that the current branch belongs to the microservice or feature of this modification, and may not be developed directly in `main`.
7. Re-read the authoritative `AI_TASKS.md` according to rule 14 to confirm that the task is still claimed by the current AI, and the scope of modification does not overlap with other tasks; not only check the copy of the current Worktree.
8. When involving external platforms, check whether the official website, purpose and check date in `REFERENCES.md` have been synchronized.

## AI execution rules

1. Before executing `git commit` or `git push`, you must check the git status.
2. When sensitive or irrelevant files are found, they must be repaired first before continuing to submit.
3. When the document is inconsistent with the code, the document should be supplemented first.
4. Do not submit `selfdata.json`, local sensitive information folders, log files, key files, and environment variable files.
5. After the completion of the feature branch, the commit SHA to be tested should be submitted and recorded, and then submitted to the user for testing.
6. Before synchronizing to `main`, it must be checked that the commit SHA of the user test is consistent with the actual commit to be merged.
7. The consolidated record of `main` must indicate `Source-Branch`, `Tested-Commit` and human verification information.
8. The commit instructions or task records should indicate the execution AI and task number to facilitate traceability between Codex and Claude Code.

## Submit access

Commit or push operations are only allowed after the review pass is passed.
