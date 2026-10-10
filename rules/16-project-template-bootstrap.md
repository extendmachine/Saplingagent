# 16. Whole directory project template and initialization

## Target

`0.skills项目规范/` The whole catalog itself is a project template. When the user requests to introduce or copy the specification, all the controlled content of this directory should be directly copied to the root directory of the target project and the public specification of the same name should be covered, and then initialized or rectified according to the scope of authorization. ONLY READING README OR REVIEWING ITEMS DO NOT TRIGGER COPYING AND MODIFICATION. It is forbidden to establish `templates/`, `template/` or other second sets of specification template directories.

## The location of the template content

1. Root directory `FINAL_GOAL.md`: the final target file structure, which is directly rewritten according to the target project after copying.
2. Root directory `TODO.md`: project progress, manual verification and Git branch management structure, copy and rewrite directly.
3. Root directory `AI_TASKS.md`: task index, coordinate information and fill in the format; after copying, clear the normal source history, and restore the valid tasks of the target project. When coordinating Worktree is enabled, locate the authoritative index according to Rule 14.
4. `rules/07-service-contracts.md`: Fill in the format of microservices `SERVICE.md` and `CONTRACT.md`.
5. `rules/10-database-deploy-rollback.md`: microservice `DEPLOY.md` fill in the format.
6. `rules/15-official-links-and-source-traceability.md`: Microservice `REFERENCES.md` fill in the format.
7. `rules/14-multi-ai-task-worktree-handoff.md`: microservice `ai-tasks/<task-id>.md` handover format.
8. `rules/05-local-secrets-security.md`: Local private information directory and general ledger JSON format.
9. `rules/03-logging-structure.md`: microservice log filling format.
10. `rules/11-environment-isolation.md`: The format of filling in the running environment in the project.
11. `docs/`: HTML files for project descriptions, interfaces and official websites for people to review, and update them synchronously according to the target project after copying.
12. `services/README.md`: microservice root directory description, after copying, create a real service directory directly at the same level.
13. `logs/README.md`: The log root directory security skeleton, and the target project directly creates the service log directory at the same level.
14. `local-secrets/`: classified directory, security instructions and empty `notes/project-secrets.json`, copy and fill in the private information of the target project directly.

## Initialization order after overall migration

1. Read the existing goals, progress, authoritative task records and project-specific requirements of the target project before coverage, and save the project facts that need to be restored to the task records in the project that will not be covered; coordinate the affected ongoing tasks and do not save the secret value.
2. Copy all the controlled contents of this specification directory to the root directory of the target project according to the root directory `README.md`, the file of the same name is directly overwritten, and `rules/` is completely replaced.
   `logs/` and `local-secrets/` are ignored by Git and must be obtained through local whole directory replication; existing projects only make up for the missing skeleton and do not cover the real local data.
3. Complete the replication stage check according to the root README, and then read the entrance, rule and status file from the target project; read the authoritative records in it when there is a coordinated Worktree.
4. Rebuild the root state file in combination with the target code, user requirements and saved facts, delete the standard source history; restore the effective claim, coordinator and authorization information of the target project, and do not reset the real-time status of the existing coordination Worktree.
5. Identify the boundaries of microservices, and complete the responsibilities, contracts, deployments, sources and handover documents of the real service within the authorized scope; the unauthorized business restructuring record plan cannot be executed by the time of copying.
6. Check the copied `local-secrets/` catalog and empty ledger, fill in the target project information directly, and confirm that the entire directory is not tracked by Git.
7. Configure independent log subdirectories, day-by-day recording and 30-day cleaning methods within the scope of authorization; unfinished items are listed as follow-up tasks.
8. The running environment continues to belong to the project according to Rule 11, and the actual environment migration retains the relevant approval requirements; the configuration has been completed to write the service description or deployment description.
9. Synchronize `docs/index.html`, `docs/api-interfaces.html` and `docs/references.html` according to the microservice content.
10. Complete the initialization stage check according to the root README, give the coverage receipt and the end review receipt, and explain the implementation, self-inspection, human acceptance and main synchronization status respectively, and do not count the pending implementation plan as completed.

## Prohibited matters

1. It is forbidden to create an independent `templates/` directory to save the second project template.
2. It is forbidden to refer only to the absolute path of the original `0.skills项目规范/`; the target project must be able to read and run independently.
3. It is forbidden to regard the historical objectives, TODO or task numbers of this specification project as the facts of the target project.
4. It is forbidden to fill in real and private information in rule examples, documents or replies.
5. It is forbidden to mistake the security empty skeleton of the standardized source directory for real sensitive information; it is also forbidden to bring back the `local-secrets/`, real log, environment directory, dependent cache or `.git/` of the target project back to the distribution package.
6. It is forbidden to retain unprocessed placeholders, false services, fake interfaces or inapplicable environmental configurations.

## Stage acceptance

In the replication stage, check that the public specification document is consistent with the source; in the initialization stage, check the project facts and compliance structure. The legal `AGENTS.md` project-specific supplement does not require consistency with the source word by word. The target general ledger can be filled in the actual content, and only the standard source general ledger must be empty.

The following items are checked according to the current scope of authorization; the missing items must be reported, and only when all the required stages are completed can the stage be declared completed:

1. The root directory of the target project contains all specification entrances, status files, `rules/`, `docs/`, `services/`, `logs/` and `local-secrets/`, and there is no `templates/`.
2. The target project no longer contains the historical tasks, progress and task numbers of this specification project.
3. Each actual microservice has an independent directory and `SERVICE.md`, `CONTRACT.md`, `DEPLOY.md`, `REFERENCES.md` and `ai-tasks/`.
4. The target project exists locally `local-secrets/notes/project-secrets.json`, and `local-secrets/` is not tracked by Git.
5. Each microservice has an independent log plan, and the log file is named by day and kept for 30 days.
6. The project running environment, dependencies, Docker configuration and running products are all located in the project directory.
7. Human HTML documents are consistent with microservice Markdown contracts and source records.
8. The authoritative index and coordinator can be located, and the original valid tasks and authorizations of the target project have been restored, and the scope is not re-claimed from the outdated snapshots of other Worktree.
