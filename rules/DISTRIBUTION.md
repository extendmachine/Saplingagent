# AI project specification document

Here is a set of local rule files used to regulate AI to perform project tasks.

> **Distribution requirements:** When the user requests to introduce or copy the specification, this folder as a whole is the project template. AI must copy all the controlled content to the user-specified target project root directory, including `.gitignore`, entry file, status file, `rules/`, `docs/`, `services/`, `logs/` and `local-secrets/` security skeleton. The file of the same name in the public specification is directly overwritten, and `rules/` is completely replaced; the real private information and real logs of existing projects shall not be covered by the empty skeleton.

## Enforce instructions for follow-up AI

First, determine the task type according to the user's requirements, and the execution boundary shall be subject to `rules/README.md`:

- Only read review, check or make suggestions: read the actual content of the target project, output discovery and editing suggestions, and do not copy, reconstruct or update the status file.
- Introduce or copy specifications: Follow the following 12 steps to complete the copy of controlled content, necessary initialization and inspection; business rectification is only implemented within the scope of authorization.
- Implement rectification: implement according to the suggestions confirmed by the user or clear rectification requirements, and do not apply for the same scope of authorization repeatedly. Only reading this document does not constitute any write authorization.

The following is the order in which the distribution of authorized specifications has been authorized. When the user only requires a certain stage, it should be delivered according to that stage and the follow-up matters should be truthfully recorded; it shall not claim that the unexecuted rectification or manual acceptance has been completed.

1. **Confirm the source directory and the target directory. ** The source directory is fixed as `/Users/xty/Desktop/projctworks/0.skills项目规范/`; the target directory must be the root directory of the user-specified project. Before starting, report two absolute paths and expected processing range to the user, and the source directory itself should not be mistaken for target project modification.
2. **Take stock of the current situation of the target project. ** Read the existing entry files, targets, todo, authoritative task records, directory structure, technology stacks, Git status, microservices, interfaces, deployment methods and project-specific instructions of the target project before overwriting. Save the project facts that must be restored after overwriting to the task record in the project that will not be overwritten, and only keep the fact and credentials path; coordinate the ongo tasks affected by the coverage to prevent the loss of valid claims and authorization.
3. **Protect the local data of the target project. ** First identify and retain the existing `local-secrets/`, real logs, database files, environment directories, business codes and other local data. The empty general ledger and empty directory description in the standard source shall not cover the private information or real log filled in the target project; the real key shall not be copied, displayed or submitted.
4. **Complete copy of the specification package. ** Copy all the controlled contents of this project to the root directory of the target project, and directly overwrite the public specification file of the same name according to the list of this README. `rules/` must be completely replaced according to the source directory, and cannot be selectively copied, merged differences, retained old rules or created a new second set of template directories.
5. **Reload the specification from the target project. ** Complete the "copy stage check" below first, and then re-read the entrance, rules and status files from the target copy, and locate the authoritative task index according to rule 14. Identify the newly copied template history and reconstruct the project facts in step 8; follow-up implementation is based on the target project rules and persistent facts.
6. ** Comprehensively examine the target project. ** Check project goals, directory boundaries, microservice responsibilities, cross-service dependencies, front-end and back-end interfaces, databases, logs, environments, deployments, sensitive information, Git branches and human documents based on real code and configurations. Identify non-standard content, missing documents, coupling points, risks and matters to be confirmed.
7. **First, list the reconstruction review results and modification plans. ** Give users the inspection results in order of priority, and clarify the services, directories, files, causes, impacts and verification methods planned to be modified. The authorized standardization work can continue; when it involves deleting business files, moving a large number of code, database migration, overwriting real data or other irreversible operations, the check has been clearly approved. If there is no corresponding approval, it will be confirmed first.
8. ** Rebuild the status file of the target project. ** Rebuild `FINAL_GOAL.md`, `TODO.md` and `AI_TASKS.md` according to the actual content of the target project and the facts saved before covering, and clear the project history of this specification. Restore the original valid claim, coordinator and authorization records of the target project, and cannot reset the real-time status of the existing coordinated Worktree; the target, progress, branch, Worktree and verification status must be true and traceable.
9. **Reorganize and complete the project by microservice. ** Within the scope of authorized initialization or rectification, complete `SERVICE.md`, `CONTRACT.md`, `DEPLOY.md`, `REFERENCES.md` and `ai-tasks/` for the actual service; the code structure transformation is implemented according to the scope of authorization in step 7, and the rest are listed as follow-up plans. One level and one module serve one directory, cross-service communication according to interface or shared contract, and no false services are created.
10. ** Complete the project operation and safety management. ** Configure service logs, day-based records and ordinary logs for 30 days according to the scope of authorization, and the operating environment complies with rule 11; unauthorized shared environment migration and other operations are listed as pending confirmation. Private information is only stored in the target local `local-secrets/` to confirm that it is not tracked by Git, and the real content is not covered by the empty general ledger.
11. ** Synchronize human review of documents and Git management. ** Update `docs/index.html`, `docs/api-interfaces.html` and `docs/references.html` according to the real content of the target project. The modification must enter the corresponding microservice or feature branch, and the manual test binds the specific submission; after the user confirms, it will be synchronized to `main`, and record the source branch, test submission, task number and execution AI.
12. **Complete the inspection and submit the receipt. ** Complete the "initialization stage check" below to check the results of the current authorization stage. Give the "Receipt of Standard Package Coverage" and "Receipt of End Review", distinguish between realization, self-inspection, manual acceptance and main synchronization, and list the follow-up matters that have not been completed or unauthorized.

The completion of standardized distribution must include replication check, rule loading, structural review, project fact reconstruction and initialization review within the scope of the current authorization. When the user only requests to review, the review report shall be delivered, and the above writing steps shall not be carried out.

The public control specification and rule index are unified in `rules/README.md`. The root directory `AGENTS.md` is a lightweight startup entrance. Claude Code imports the entrance through `CLAUDE.md` and continues to read the same rule center.

- Microservice architecture organization
- Git pre-submission screening
- Log directory specification
- Git branch, manual test confirmation, main synchronization and source version marking specification
- Local Sensitive Information Folder Security Specification
- Final goal, current progress todo and docs/html description document specification
- Microservice contract, service description, dependency, error log, manual verification, deployment rollback specification
- In-project environment isolation, Python venv, Docker in-project configuration specifications
- Front-end and back-end interface manual review of documents, interface name and content maintenance specifications
- Codex and Claude Code share rule sources, task claims, Worktree and handover specifications
- The official website of the third-party platform, the entrance of the public key certificate and the traceability specification of the data source
- The base of the whole catalog project, as well as the microservices, private information, logs, environment and handover filling formats built into each rule
- Clawtask conversation v2.0 project packaging, attachment tools, verification and platform delivery process

When using, Codex and other compatible tools enter from `AGENTS.md`; Claude Code enters from `CLAUDE.md` and imports `AGENTS.md`. Both entrances must point to `rules/README.md`, and do not copy the complete public rules in the entrance file.

The "Project-specific Supplement" area of `AGENTS.md` can be maintained by AI according to the actual situation of the project, so as to retain the short tips required by tools such as Codex; public control specifications, rule indexes and detailed requirements must be maintained in `rules/` to avoid too long entry context.

After AI completes the reading and minimum registration according to the rule index, it will give a standardized reading receipt before the first substantial modification; give a receipt for the end review before the end or submission. The receipt does not need to wait for the user's reply; read-only tasks do not need to be written to the registration and status files.

This specification is designed according to user habits: each project must have `FINAL_GOAL.md`, `TODO.md` and `AI_TASKS.md`, and AI must read them before each modification.

The HTML file in `docs/` mainly gives people a preview. When AI performs tasks, it should give priority to reading the Markdown instructions in the root directory target, todo and microservice directory.

The `docs/api-interfaces.html` of each target project is used for manual review of front-end and back-end interfaces. When AI modifies the interface, it should take `CONTRACT.md` in the microservice as the basis for execution, and maintain this HTML review document synchronously.

Git work is managed by AI microservice branches and feature branches. After AI completes the modification and submits it to the corresponding branch, the branch name, the submission number to be tested and the test steps should be given to the user; after the user confirms that the version has passed the test, AI will synchronize to `main`, and indicate the source branch and the tested submission in the merge record. Users mainly manage and use `main`.

The coordinator maintains the Git branch management list in the authoritative `TODO.md` of the target project, distinguishing between recorded submissions, frozen submissions to be tested and main merged versions. The frozen record update enters the unfreezed coordination branch and does not change the delivered version to be tested; the record snapshots entering the main also need to be reviewed manually.

When multiple AIs or multiple dialogues work in parallel, the coordinator shall register in the `.worktrees/coordination/AI_TASKS.md` specified in Rule 14, and each task uses an independent branch and Worktree. Execute AI to save the progress in their respective services `ai-tasks/<task-id>.md`; the root index of ordinary Worktree is only a snapshot. Non-Git projects use the authoritative index of the root directory and overlap to modify the serial.

When involving third-party platforms, APIs, SDKs, public keys, certificates or consoles, AI must provide the official website that has actually been checked, save the source in the microservice `REFERENCES.md`, and synchronize it to `docs/references.html` for review.

The actual private information ledger is fixed to the local `local-secrets/notes/project-secrets.json` of the target project. The format of the general ledger and classified credentials is directly maintained in `rules/05-local-secrets-security.md`, and real and private information is not stored in the specification package.

The specification source has been pre-built `services/`, `logs/` and `local-secrets/`. It only contains the directory description and the empty general ledger, which is convenient for the new project to be copied and filled in directly after copying the whole directory; no real service log or real credentials shall be written in this specification source.

When the user says synonymous requirements such as "Please package the project as clawtask available" and "generate a Clawtask import package", or modify the Clawtask deployment scheme, AI must be executed according to `rules/17-clawtask-project-packaging.md`. Read the latest content of `/Users/xty/Desktop/projctworks/5.clawtask/tools/skills/clawtask-package/assets/demo/` before each relevant modification, and check the difference between the source Skill, contract and this project `rules/clawtask-package-skill-v2.zip`. By default, the conversation v2.0 group chat project package is generated; the attachment is a fixed version of the packaging tool, not a real-time mirror image of the latest Demo, nor a business package that can be uploaded directly, no need to install Skill globally.

When the Clawtask delivery project has a web interface, you must add [Deployed with Clawtask ↗] (https://clawtask.fun/) at the bottom of the actual web page according to Rule 17, and check the delivery package and the actual display; the link cannot be placed only in the instruction file.

## Mandatory way to distribute to other projects

This document is a standard package distribution guidance document. After receiving the task of "introducing project specifications into the target project", AI must read this file and copy all the controlled contents in this folder to the root directory of the target project. Replication adopts the method of direct overwriting, and does not use the method of selective copying, merging differences or retaining the old version of the target project specifications.

Source specification catalog:

```text
/Users/xty/Desktop/projctworks/0.skills Project Specification/
```

`logs/` and `local-secrets/` are ignored by `.gitignore` according to security rules, so the whole directory must be copied from the local specification directory; it cannot be relied on Git submission or Git clone to automatically carry these two directory skeletons.

The target directory must be the root directory of the user-specified project. The copy operation only covers the files or directories of the same name in the source specification package, and does not delete the business codes, resources and other project files that are not related to the same name in the target project.

## Content that must be copied and overwritten

The following content is only the main list of the current specification package, not the optional list. The controlled specification files added after the source specification directory must also be copied together:

```text
.gitignore
AGENTS.md
CLAUDE.md
README.md
FINAL_GOAL.md
TODO.md
AI_TASKS.md
Rules/ # must be mirrored in the whole directory
Docs/ # Copy all the source files and overwrite the files of the same name
Services/ # Microservice root directory description and follow-up service directory location
Logs/ # Log root directory security empty skeleton
Local-secrets/ # Private information classification directory, security instructions and empty general ledger
```

`rules/17-clawtask-project-packaging.md` and `rules/clawtask-package-skill-v2.zip` must be copied together; this ZIP is a user-specified controlled specification attachment and does not belong to the following products excluded. The tool runs in the target project; Clawtask-related modifications must also check the latest Demo source directory specified by the user according to Rule 17. When other machines cannot access the directory, the latest accessible copy should be obtained, and the package snapshot should not be impersonated as the latest scheme; the business execution script shall not rely on the absolute path of the development machine.

Implementation requirements:

1. `AGENTS.md` must be directly overwritten, including the file of the same name that the target project already has; it must not be skipped because the file already exists in the target project.
2. `CLAUDE.md`, `README.md`, `FINAL_GOAL.md`, `TODO.md`, `AI_TASKS.md` and `.gitignore` are also directly covered.
3. `rules/` is a mandatory focus: `rules/` of the target item must be completely replaced with `rules/` in the source specification catalog. The old rule files that do not exist in the target `rules/` source specification must also be removed to avoid the new and old rules taking effect at the same time.
4. All files provided by the `docs/` source specification package must be copied and directly overwritten with the same name file in the target project; other human documents with different names in the target project can be retained.
5. The security skeleton of `services/`, `logs/` and `local-secrets/` must be copied to the new project; the actual business content, real logs and real credentials of the directory of the same name in the existing project must be retained.
6. Do not only copy the entrance file and refer to the source directory, and do not allow the target project to rely on the absolute path of the source specification directory. The target project must have a complete and readable copy of the specification.
7. Do not skip the public specification file according to AI's own judgment, and do not automatically merge the old specification content back to the new specification.
8. Do not create `templates/`, `template/` or other second set of template directories; the built-in format in the root file, pre-built directory and `rules/` is the only template.

## Local data that does not belong to the specification package

"Copy all" refers to all controlled standard contents. The following local data, running products and system files are not specification packages and may not be copied to the target project:

```text
.git/
.DS_Store
Real credentials filled in in local-secrets/
The real content in .secrets/ and secrets/
The real content in selfdata.json
The real log file in logs/
.venv/
node_modules/
docker-images/
.worktrees/
.cache/
dist/
build/
Caches, temporary files and other generated products
```

Any API key, password, private key, server credentials or real sensitive data shall not be distributed with the specification package.

## Cover the processing order before and after

1. Save the facts and effective claim of the target project according to the first step 2, and check the source directory, target root directory, authoritative task index and local sensitive directory status.
2. Copy all the controlled contents of the source specification package to the target project; the public specification file of the same name is directly overwritten, and the new project completely copies the three pre-built directory skeletons at the same time.
3. Replace the `rules/` of the target item with the complete `rules/` of the source specification directory, and check whether the old rule file is residual.
4. When the target project already has real `local-secrets/` or real logs, keep these local data; do not use the empty general ledger or documentation of the standard source to destroy the actual content.
5. Complete the "Replication Stage Check", re-read the entrance, rule and status file from the target project, and locate the authoritative record according to Rule 14.
6. Rebuild the root status file according to the target code, user requirements and saved project facts, delete the standard source history, and restore the effective claim and authorization of the target project; the real-time status of the already coordinated Worktree must not be reset by the template.
7. The public entrance of `AGENTS.md` remains the standard package version; if necessary, only a brief prompt for the target project is written in its "project-specific supplement" area, and the old public rules that have been covered cannot be restored.
8. Supplement the project-specific omissions of `.gitignore` according to the target project technology stack, but do not delete the sensitive information, logs, environment and local AI configuration omissions already in the specification package.
9. Complete the actual microservice description according to Rules 07, 10, 14 and 15 within the scope of authorization; only the plan is listed for unauthorized business restructuring.
10. Check the copied `local-secrets/notes/project-secrets.json` and fill in the target project ledger and classification credentials directly according to Rule 05. Real `local-secrets/` is not allowed to enter Git.
11. Configure logs and in-project environments according to rules 03 and 11 within the scope of authorization; the actual migration retains the relevant approval requirements.
12. Rebuild or update `docs/index.html`, `docs/api-interfaces.html` and `docs/references.html` according to the actual situation of the target project; these HTMLs are for review and are not the main basis for the implementation of AI.

## Override authorization and prohibition

WHEN THE USER IMPLEMENTS THE SPECIFICATION DISTRIBUTION THROUGH THIS README REQUEST, IT MEANS THAT THE SPECIFICATION FILE OF THE SAME NAME IN THE TARGET PROJECT HAS BEEN AUTHORIZED TO OVERRIDE. AI should first report the source directory, the target directory and the expected coverage, and then execute it. There is no need to ask whether it is covered one by one.

The following behaviors are prohibited:

1. After finding that the target already has `AGENTS.md`, change it to merge or skip.
2. Only update `rules/README.md`, but keep other old rule files.
3. Generate `.bak`, `old-rules/` or a second set of parallel rule catalogs to keep the target old rules.
4. Continue to use the content of `FINAL_GOAL.md`, `TODO.md` or `AI_TASKS.md` of this specification project as the fact of the target project.
5. Overwrite or delete business codes and resources with different names from the specification package in the target project.
6. Copy `.git/`, key, log, virtual environment, dependency cache or generated product.
7. Create an independent template directory, fill in the real secret in the rule example, or bring the actual `local-secrets/` of the target project back to the specification package.
8. Use the empty `project-secrets.json` of the specification source to cover the private information ledger that has been filled in by the existing project, or delete the real log of the target project.

## Copy stage inspection

Execute when the copy is completed and the special content of the project has not been filled in:

1. Check that all the controlled content has been copied; the public specification file of the same name is consistent with the source, and `AGENTS.md` and `CLAUDE.md` have been overwritten and the import chain has been retained.
2. Check that the file list, content and specification version of the target `rules/` are consistent with the source, and there are no residual old rules.
3. Check that the pre-built directory has been copied or filled in according to the rules; the new project obtains an empty general ledger, and the real general ledger, service content and log of the existing project remain intact.
4. Check the uncopied `.git/`, real credentials, real logs, environment, dependent cache and `.worktrees/` and other running contents.

## Initialization stage check

After initializing the current authorization scope according to the real content of the target project, execute:

1. Confirm that the verification of the replication stage has been completed, and the project-specific documents have been filled in according to the actual situation; all customized files are not required to continue to be equivalent to the source file word by word.
2. Confirm that the public entrance, must-read list and priority of the target `AGENTS.md` are intact, including `@rules/README.md`; "Project-specific Supplement" allows compliance differences.
3. Confirm that the target `CLAUDE.md` is consistent with the source file, and enter the same rule chain through `@AGENTS.md`.
4. Confirm that the target `rules/` is consistent with the source `rules/` file list, and there are no remnants of old rules.
5. Confirm that the specification version in the target `rules/README.md` is consistent with the source specification version.
6. Confirm that the target has `FINAL_GOAL.md`, `TODO.md` and `AI_TASKS.md` that have been re-initialized according to the actual situation of the project.
7. Confirm that the target `docs/` contains at least `index.html`, `api-interfaces.html` and `references.html`.
8. Confirm that the target has microservices, logs and private information classification catalogs and legal general ledger structures; the target general ledger can fill in the real project information, which can be empty when there are no credentials, and the existing content is not required to be emptied.
9. Confirm that there is no additional `templates/` or a second set of specification catalogs in the target project.
10. Confirm that the target local `local-secrets/notes/project-secrets.json` has been retained or filled in according to the project situation, and the whole `local-secrets/` has not been tracked by Git.
11. Confirm that `.gitignore` has ignored local sensitive information, logs, environment variables, key files, Worktree, local AI settings and in-project running environment.
12. Confirm that there is no real sensitive data and real log in the specification source, and there is no copy of `.git/`, virtual environment, dependent directory and system temporary files.
13. Check whether the actual microservice description, contract, deployment, source and handover are complete, and include the content that has not been completed within this scope in the follow-up plan, and do not pretend to be completed.
14. Confirm that Git, multi-AI, manual testing and main synchronization rules have entered the project, the authoritative index position is clear, and the original valid claim of the target project has been restored.
15. Give a new specification reading receipt in the target project, and give the end review receipt after the initialization is completed.

## Give the completion receipt to other AI

After AI completes the specification package coverage and the initialization of the target project, it must report to the user:

```text
Standard package coverage receipt
- Source directory: /Users/xty/Desktop/projctworks/0.skills Project Specification/
- Target Catalog: <Absolute Path of Target Project>
- Overlay method: copy all controlled content, and directly overwrite the same name
- AGENTS.md: Overwritten and re-read
- Rules/: The whole directory has been replaced, and the file list and version have been checked.
- Stage inspection: copy the actual results of verification / initialization review
- Status files: FINAL_GOAL.md, TODO.md, AI_TASKS.md have been re-initialized according to the target project
- Directory skeleton: services/, logs/, local-secrets/ has been copied and checked
- Task coordination: authoritative index location, coordinator and original effective claim recovery
- Private information general ledger: initialized in the target local, or confirmed that no credentials are required at present; not entered Git
- Docs/: The specification template has been overwritten and synchronized according to the target project.
- Security check: not copied .git, key, log, running environment and generated product
- Standard version: <version in target rules/README.md>
- Acceptance status: <Realization, self-inspection, manual acceptance, main synchronization separately explained>
- Legacy items: <None, or list the content that needs to be confirmed by the user>
```
