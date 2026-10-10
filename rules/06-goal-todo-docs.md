# 06. Final goal, current progress and docs documentation

## Target

Each project must contain a final target file and a current progress todo file. AI must read these two files before each modification to prevent the task from running sideway and prevent the task from continuing after being interrupted.

The explanation file of the project must be placed in the independent `docs/` folder of the root directory, and it must be built using HTML for direct preview. `docs/` mainly shows people that AI does not use `docs/` as the basis for tasks; AI should give priority to reading `rules/README.md`, `FINAL_GOAL.md`, `TODO.md`, `AI_TASKS.md` and Markdown instructions in the microservice catalog.

## Required documents

```text
project-root/
├── FINAL_GOAL.md
├── TODO.md
├── AI_TASKS.md
└── docs/
    ├── index.html
    ├── api-interfaces.html
    └── references.html
```

## FINAL_GOAL.md Specification

`FINAL_GOAL.md` records the final project goal and may be updated as the project evolves.

It must contain:

1. What will be completed in the end of the project?
2. The scope of core functions.
3. Don't do anything at present to avoid expanding the scope.
4. Acceptance standards.

## TODO.md specification

`TODO.md` is used to record the current progress and the next task.

It must contain:

1. The content has been completed at present.
2. The content in progress.
3. The next step is to be done.
4. Known problem or blockage point.
5. The latest AI modification record.

`TODO.md` records the overall progress of the project, and `AI_TASKS.md` records the task claim, modification scope, branch, Worktree and current status of multiple AI and multiple dialogues, and the two cannot be substituted with each other.

When modifying in parallel, coordinate the authoritative index and progress in Worktree according to Rule 14, and summarize it serially by the coordinator; each execution AI records the progress in its own task file. The root status file of other Worktree is only a submitted snapshot. Read-only tasks do not require writing documents for progress records.

## Docs specification

1. The root directory must have an independent `docs/` folder.
2. Put the explanation file for people to see in `docs/`.
3. The interpretation file is built using HTML, which is convenient for local preview.
4. `docs/index.html` should be used as the entrance to the project description.
5. The content of the document should be readable to people, explaining the purpose, structure, service, operation mode and notes of the project.
6. AI execution rules and sensitive information are not stored in `docs/`.
7. `docs/references.html` is used to review the official website, purpose and check date of third-party platforms.

## Standardize package distribution and coverage

1. The root directory `README.md` is the mandatory guidance document when this specification package is distributed to other projects.
   Only when the user requests to introduce or copy the specification will the coverage be carried out; only reviewing the project or reading README does not constitute the authorization of copying and rectification.
2. AI must copy all the controlled content in the source specification directory to the root directory of the target project, and the file of the same name must be directly overwritten, without selective copying or merging old rules.
3. `AGENTS.md`, `CLAUDE.md`, `README.md`, `.gitignore`, `FINAL_GOAL.md`, `TODO.md` and `AI_TASKS.md` are all contents that must be covered.
4. `rules/` must be completely mirrored according to the source directory; old rule files that do not exist in the source specification in the target directory must be removed to prevent the two sets of rules from taking effect at the same time.
5. The documents provided by the `docs/` source specification must overwrite the file of the same name as the target; other human documents with different names in the target project can be retained.
6. The security skeleton of `services/`, `logs/` and `local-secrets/` belongs to the standard package: new projects must be copied completely; existing projects only supplement the missing skeleton files, and may not overwrite the actual service content, real logs or filled-in private information ledger.
7. Cover only for the content of the same name in the specification package, and do not delete business codes, resources and project files that are not related to the same name in the target project.
8. This specification directory itself is a project template, and it is no longer allowed to create or rely on a separate `templates/` directory.
9. `.git/`, real sensitive information, real logs, virtual environment, dependent cache, construction products and system temporary files do not belong to the specification package and are prohibited from distribution.
10. Before overwriting, you should read the existing goals, progress, authoritative task records and local sensitive directory status of the target project, and coordinate the ongoing tasks affected by the coverage; save the project facts required for reconstruction after coverage, and do not copy secret values. When covering, the real private information ledger filled in by the target project shall not be covered with the standardized source empty general ledger.
11. After overwriting, directly rebuild `FINAL_GOAL.md`, `TODO.md` and `AI_TASKS.md` in the target copy, and the status records of this specification project itself shall not be followed; the original valid claim, coordinator and authorization records of the target project must be restored, and the real-time records of the coordinated Worktree must not be reset by the template history.
12. Microservices, private information, logs, environments and handover formats are obtained directly from the body of the corresponding `rules/` rule, not copied from the second set of template directories.
13. In the replication stage, check the consistency of the source file and the public rules; in the initialization stage, check the project facts, the entrance public part, the legal project supplement and the general ledger structure. AI must re-read the entrance and rules from the target project and give the standard package coverage receipt; it is not required that the full text of the customized AGENTS is equal to the source file, and the general ledger of the target project is not required to be empty.
14. When the user distributes according to the requirements of the root directory `README.md`, it is considered that the public specification file of the same name has been authorized to be overwritten; the real `local-secrets/` and the real log are not within the scope of the overwriting authorization.

## AI execution rules

1. Before each modification of the code, you must read `FINAL_GOAL.md`, `TODO.md` and `AI_TASKS.md`.
2. After the modification is completed, the task record should be updated according to the actual progress, and the coordinator should summarize the authoritative `TODO.md`; the read-only task does not modify the status file.
3. When the user has clearly changed the project goal, scope or acceptance standards, he/she should update `FINAL_GOAL.md` synchronously. AI's self-propossed expansion should be confirmed first, and cannot be self-authorized by rewriting the target file.
4. If this modification affects the way human understanding of the project, `docs/index.html` or the corresponding HTML document should be updated synchronously.
5. Do not scatter human-oriented explanation documents in the root directory or service directory of the project, and collect them in `docs/`.
6. The instructions read by microservices to AI must be placed in the microservice directory and use Markdown format.
7. When the status of parallel tasks changes, notify the coordinator to synchronize the authoritative `AI_TASKS.md` and `TODO.md` according to Rule 14, and rewrite the status snapshots of each Worktree in parallel.
8. After completing the reading and minimum registration according to the rule index, the rules-reading receipt will be given before the first substantive modification to confirm that the target, progress and task status have been read; after the receipt is sent, the authorized work can continue.
9. Before the end of the task, the authoritative status file must be re-read, and indicate whether the document has been synchronized in the end review receipt; the read-only task indicates that there is no need to be synchronized.
10. When implementing the specification distribution, you must comply with the "Specification Package Distribution and Overlay" of this document and the root directory `README.md`, and the old version of the public rules covered by the target project must not be restored.
