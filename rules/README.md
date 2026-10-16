# AI Project Control Specification and Rule Index

Specification version: `2026-10-15.1`

This document is the only source of project public control specifications and rule indexes. Codex, Claude Code and other AI enter this file from the root directory entrance file, and then read the relevant details according to the current task.

## Entry points

```text
Codex / Other AI -> AGENTS.md -> rules/README.md
Claude Code      -> CLAUDE.md -> AGENTS.md -> rules/README.md
```

The root directory `AGENTS.md` only saves startup guidance and a small number of project-specific prompts; `CLAUDE.md` is only responsible for importing `AGENTS.md`. Public control specifications, rule indexes and cross-AI constraints are uniformly maintained in the detailed rules under this document and `rules/`.

The default requirements in the global AI entrance are used to supplement the matters not stipulated in the project; the content clearly stipulated in the project shall be subject to the rules of this project. Skill provides a task-specific method, does not expand user authorization on its own, and does not override the approval requirements that have been clearly retained by the project.

## Task type and authorization

1. Read-only review, explanation, analysis and program discussion: read relevant documents and output the results with the completion-review receipt, do not write task registration, TODO or other documents for process requirements. When the user clearly requests to review first and then modify, he must wait until the modification is approved before entering the modification process.
2. Modification task: complete the necessary analysis, implementation, document synchronization and appropriate self-examination within the goals authorized by the user, and do not repeatedly request approval for ordinary implementation details.
3. Specification distribution: Only when the user requests to introduce or copy the specification, perform the whole package overwriting according to the root directory `README.md`; only reading the file or requesting to review the project does not constitute copying, restructuring or deployment authorization.
4. The receipt is AI's notification of the reading and review results, not the approval process waiting for the user's reply. Clear approval requirements such as main synchronization, interface manual confirmation, environment migration and external release are still implemented in accordance with relevant rules.
5. Clear authorization is valid in the same object, action and scope; check the actual conditions before execution, and the authorization cannot be extended to different goals, untested submissions or additional external operations.
6. When the user directly provides real credentials for the current project in the dialogue, the `local-secrets/` of the target project shall be deposited in accordance with Rule 05 and the general ledger shall be registered. It does not repeatedly ask whether to save it, nor does it require the user to build the file by himself; only local deposit, except for examples, read-only references and content that is clearly prohibited from saving.

## Before starting the task

The modification task is executed in the following order; the review results are directly given after the read-only task completes the necessary reading and inspection:

1. Read this file in full.
2. Read the root directory `FINAL_GOAL.md`, `TODO.md` and `AI_TASKS.md`; parallel tasks locate and read the authoritative task index and progress according to Rule 14, and cannot only read the snapshot of the current Worktree.
3. Confirm the microservice or project-level function to which the task belongs, execute AI, modify the scope, branch and Worktree.
4. Read the service description, contract, deployment, source and handover documents related to the current task, as well as the detailed rules routed below. Mark "not applicable" when project-level tasks do not have microservices.
5. Follow "Differences and conflict handling" below to check the file, version and task attribution.
6. Complete the minimum task registration; in parallel, it is registered by the coordinator in the authoritative index. This registration and the necessary coordination branch and Worktree establishment are the start-up preparation, which can be implemented before the receipt, and must not include application changes.
7. Give the user a "rules-reading receipt" before the first substantive modification, and the authorized work can continue after sending.

If the required file does not exist at the time of initialization, it should be truthfully recorded and created and filled in within the scope of authorized initialization; the sample history of the standard source shall not be regarded as the fact of the target project, and the missing information shall not be fabricated. Only when reviewing, only report missing.

## Differences and conflict handling

1. If the rule version changes, the record is outdated or the file is different from expectations, read and check the actual differences again first, and do not directly identify it as a substantial conflict.
2. If the processing method can be clearly determined according to the priority and existing authorization in the project, it shall continue after recording the basis; when it involves new rules, read the detailed rules and update the receipt. The newer version number itself does not constitute a reason to overwrite other people's modifications.
3. Actual task occupation, uncertain business meaning, incompatible valid instructions or the impact beyond the authorization, suspend the affected part, keep the site and request manual confirmation; the authorized work that can be completed independently continues.
4. Do not roll back or overwrite other people's modifications, and do not remove restrictions by rewriting `FINAL_GOAL.md` or task scope by yourself. When the user clearly changes the goal, the project facts are synchronized; the scope expansion proposed by AI must be approved.

## Rules-reading receipt

AI must use the following format to inform users of the reading results before starting the substantive modification:

```text
Rules-reading receipt
- Standard version: <version in rules/README.md>
- Read: FINAL_GOAL.md, TODO.md, AI_TASKS.md
- Current task: <task number and execution AI; register first when not registered>
- Applicable rules: <The rule number and name actually read this time>
- Modification scope: <Services, directories or files that are allowed to be modified>
- Conflict check: <No conflict, or indicate the problem that needs to be confirmed manually>
```

Implementation requirements:

1. The receipt must contain the actual reading results, and the template must not be used in advance before supplementing the file.
2. When the modification task has not been registered, complete the minimum registration according to the above activation order first, and then give a receipt; the read-only task does not need to add new registration, and the file cannot be modified.
3. When the applicable rules change, you should read the new rules and update the receipt.
4. When there is a difference in the specification version, task attribution or modification scope, it will be verified according to "Difference and Conflict Handling"; when there is an unresolved substantive conflict, do not continue to modify the affected content.

## Rule index and task routing

- `01-microservice-architecture.md`: Read when adding new functions, adjusting directories, dividing service boundaries or cross-service communication.
- `02-git-review-before-commit.md`: Read before executing submission, push or merge.
- `03-logging-structure.md`: Read when adding or modifying logs, cleaning policies, and log directories.
- `04-git-branching-by-service.md`: Read when creating branches, completing functions, manual testing or synchronizing `main`.
- `05-local-secrets-security.md`: Read when receiving the credentials provided by the user in the conversation or processing API key, login credentials, server information, public and private keys and local sensitive files.
- `06-goal-todo-docs.md`: Read when distributing specification packages, or modifying goals, progress, task status, and human documents.
- `07-service-contracts.md`: Read when adding or modifying microservice responsibilities, interfaces, startup methods or dependencies.
- `08-dependencies-error-logs.md`: Read when modifying dependencies, error handling, log levels or abnormal output.
- `09-human-validation-and-scope.md`: Read when manual testing, scope confirmation or recording unverified matters are required.
- `10-database-deploy-rollback.md`: Read when modifying the database, deployment method, data change or rollback scheme.
- `11-environment-isolation.md`: Read when using Python, Node, Docker or other running environments.
- `12-frontend-backend-api-docs.md`: Read when adding, modifying or disabling front-end and back-end interfaces.
- `13-codex-claude-shared-instructions.md`: Read when Codex, Claude Code or other AI are mixed.
- `14-multi-ai-task-worktree-handoff.md`: Read when multiple AI, multiple conversations, parallel tasks, Worktree or task handover.
- `15-official-links-and-source-traceability.md`: Read when it involves third-party platforms, APIs, SDKs, public keys, certificates, consoles or external data.
- `16-project-template-bootstrap.md`: Read when the whole package is migrated, new projects are initialized, or the specification directory is directly used as the project base.
- `17-clawtask-project-packaging.md`: Users Require "Please Package The Project As Clawtask Available", Generate Clawtask To Import ZIP, Adapt Or Modify The Clawtask Deployment Scheme; Read The Latest Content Of `/Users/xty/Desktop/projctworks/5.clawtask/tools/skills/clawtask-package/assets/demo/` Specified By The Rule Before Each Relevant Modification, And Check The Difference Between Skill, Contract And The ZIP Snapshot Of This Project. By default, the conversation v2.0 group chat project package is generated, and the packaging is not regarded as online authorization.

- `18-saplingagent-folder-boundary.md`: Read for Saplingagent maintainer scope, complete-folder source delivery, customer-requested external code work, and the completion-review receipt required in every conversation. This is rules guidance, not a technical permission restriction.

## Principles of public execution

1. First judge which microservice the task belongs to, and then modify the corresponding service directory.
2. Microservices are distinguished from the folder hierarchy, and one module serves one directory to ensure independent modification.
3. Read the final goal, current progress and multi-AI task status before modification to prevent deviations, task interruptions or parallel conflicts.
4. Do not directly refer to the internal implementation across services, and communicate between services through API, message queues or shared contracts.
5. Perform document screening, sensitive information check and task scope check before each submission.
6. Each microservice maintains service responsibilities, structures, interfaces, startups, logs, dependencies, deployment and external source descriptions in its own directory.
7. `docs/` uses HTML for preview; AI is based on root directory status files and microservice Markdown.
8. Logs are uniformly entered into `logs/`, divided into catalogs by service, one file per day, and ordinary logs are kept for 30 days.
9. API key, private key, server login credentials and other sensitive contents are only stored in the local sensitive directory and do not enter Git; when the user provides it in the dialogue, it will be stored by AI according to Rule 05, and the file must be read for subsequent use, and the real value must not be displayed repeatedly.
10. The customer's business content is not equivalent to the login credentials or keys by default, and can be stored in the database according to business needs.
11. The modified business verification is completed by AI and manual cooperation, and the test entrance that will pollute the business data is not specifically created; the verification status is written to `TODO.md`.
12. AI does not actively modify the content outside the current goal, and additional suggestions are only recorded as to be done.
13. The project running environment must belong to the project directory; Python uses `.venv/` in the project, Node uses local dependencies, and Docker configuration and project data are placed in the project.
14. When the front-end and back-end interfaces change, update the microservice `CONTRACT.md` first, and then synchronize `docs/api-interfaces.html`.
15. After the content is completed, it is submitted to the corresponding microservice or feature branch. After the user confirms that the designated submission test has passed, it will be synchronized by AI to `main`.
16. AI manages all microservices and feature branches; users mainly manage and use `main`. The synchronous record indicates the source branch, test submission, execution AI and task number.
17. Codex and Claude Code use this file as the only public control specification, and the chat records and model memory shall not overwrite the project file.
18. When multiple AIs or dialogues are parallel, the coordinator shall register and claim in the authoritative `AI_TASKS.md` designated by Rule 14; each execution task uses independent branches and Worktree, and the unsubmitted business work catalog shall not be shared.
19. When continuing tasks across AI or cross-dialogues, maintain the handover file in the `ai-tasks/` corresponding to the microservice.
20. When involving external platforms, APIs, SDKs, public keys, certificates or consoles, provide and check the official website, and maintain the microservice `REFERENCES.md` at the same time.
21. When distributing this specification to other projects, all the controlled content must be copied according to the root directory `README.md` and the file of the same name must be directly overwritten; `rules/` must be completely replaced according to the source directory, and the old version of the rules must not be retained to take effect in parallel.
22. This specification directory itself is the project template, and no additional `templates/` is established; the root directory pre-builds `services/`, `logs/` and `local-secrets/` security skeletons, and fills in and expands directly in the target copy after copying the whole package.
23. The `local-secrets/` of the standard source directory can only contain empty ledger and security instructions, and `logs/` can only contain directory descriptions; real credentials and real logs shall not be entered into the standard source or distributed with the standard package.
24. Clawtask project packaging is executed according to Rule 17 and package attachments; projects with web pages must add the deployment logo and official website link at the bottom of the web page specified by Rule 17, and include them in the delivery inspection. This ZIP is a controlled specification tool. It must be distributed with `rules/` and must not be installed globally, nor is it used as a business import package or nested into the business ZIP.

## Priority within the project

Under the premise of not violating the rules of the platform system, security restrictions and user permissions, the internal information conflict of the project shall be handled in the following order:

1. The user's clear requirements in the current task.
2. The mandatory rules of this file and its index.
3. Project scope and acceptance standards of `FINAL_GOAL.md`.
4. The claim scope of the current task in `AI_TASKS.md`.
5. `SERVICE.md`, `CONTRACT.md`, `DEPLOY.md`, `REFERENCES.md` and handover documents of the current microservice.
6. Confirmed progress and to be done in `TODO.md`.
7. Project-specific supplement of the root directory `AGENTS.md`.
8. AI conversation records, local memory or self-inference.

Project-specific supplements of `AGENTS.md` shall not cover this document, the ultimate goal, the scope of the claimed task or the microservice contract. When there is a conflict that cannot be solved safely, it is not allowed to choose or overwrite without authorization.

## Before completing the task

1. Modify tasks to update the affected microservice descriptions and related documents; read-only tasks do not write documents for the end of the process.
2. Modify the task according to Rule 14 to update the task record and summarize it to `TODO.md` and the authoritative `AI_TASKS.md`; according to Rule 09, distinguish the implementation, self-inspection, human acceptance and main synchronization status.
3. Read this file again and compare the standard version at the beginning and end of the task.
4. Re-read the rules related to submission, manual verification and current tasks.
5. Recheck the execution AI, task status, modification scope, branch and Worktree in the authoritative task index; indicate "read-only, unregistered" for read-only tasks.
6. Check whether there are any new modifications or changes in the scope of tasks of other AI.
7. In every final reply, including ordinary chat, clarification, research and read-only tasks, give the completion-review receipt below; if the review is not completed, the task shall not be declared complete.

## Completion-review receipt

AI must review in the following eight-field format before completing each conversational turn or preparing for submission. Translate the labels into the user's language. Read-only turns are unregistered and report no modifications; a receipt does not require creating files, executing unnecessary tests or making a Git commit. Report only actual readings/checks and mark unavailable/inapplicable fields honestly:

```text
Completion-review receipt
- Standard version: start <version> / end <version>
- Task attribution: <task number, execution AI, final status>
- Actual modification scope: <actual modified service, directory or file>
- Rule review: <re-read rule number and name>
- Document status: <synchronized, or explain the reason why you don't need to synchronize>
- Verification status: <verified, pending manual testing or unverified reason>
- Git status: <branch, submission number, whether to synchronize main; non-Git project clear description>
- Remaining items: <None, or list pending and manual confirmation items>
```

If the standard version is different from the starting version at the end, the AI must re-read the new version, recheck the applicable rules and modified results, and review according to the "Difference and Conflict Handling"; when the unresolved substantive conflict affects the submission or acceptance, the corresponding work shall not be declared complete.

## English edition (2026-10-10)

Version 2026-10-10.1 translates specification 2026-09-29.1 and its controlled attachment into English. Approval requirements, rule routing, credential handling, service separation and task ownership retain the same meaning. The attachment checksum/language revision is recorded in rule 17. User-authored current instructions remain highest priority within the project. Literal paths to the user-provided source folder retain their real filesystem names.

## Saplingagent boundary clarification (2026-10-11)

Version2026-10-11.1 adds rule18 and requires the existing eight-field completion-review receipt for every conversational turn, including read-only work. Saplingagent maintainer development and complete-folder delivery stay inside the project; customer-requested external code edits remain technically possible with current Full Access. Rules recommend local scope by default. No sandbox or permission gate is added; existing human/Git/publication requirements are retained.


## Saplingagent maintainer main workflow (2026-10-12)

Version2026-10-12.1 records the Saplingagent owner's explicit instruction to synchronize authorized, self-checked work directly to main without requesting another confirmation. Rule04 defines this maintainer-only exception; rule09 distinguishes self-check results from human acceptance. Other branches still require a request to synchronize. This owner's authorization does not transfer to customer repositories or unrelated publication actions. Folder boundaries, receipts, source traceability and sensitive-file checks remain applicable.


## Main-first development and release-only presentation (2026-10-15)

Version2026-10-15.1 records the owner's updated maintainer workflow in rule04: main is for personal development/testing; release is the public default/distribution branch. Shared changes enter main first, then an authorized release synchronization. Explicit main-only work does not update release. Demo/showcase media and presentation blocks live only on release, while main links to the release introduction. Preserve release presentation during code promotion; the existing direct-main authorization and customer Git ownership remain unchanged.
