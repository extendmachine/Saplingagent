# Current progress of SeedAgent

> English translation of committed project records. Historical task statuses below retain their original time and scope. Live development ownership/progress are authoritative in the original project's .worktrees/coordination when present. This candidate does not assert human acceptance or branch synchronization.

## RUN-19e0a395 bottom version and refresh reminder

2026-10-10 / Codex / Local main. The current `branch · version number` display has been added at the bottom of the page; the `version`/`fingerprint` field has been added to the Agent Git status, and the page is checked every 5 seconds and when it is restored to visibility. When there is a new submission or file modification after the page is loaded, "Discover new version, refresh update" is displayed at the bottom, and the user clicks and reloads; do not automatically refresh, do not create branches, do not operate release/testcode or remote. Agent 41 and front-end 20 tests passed, TypeScript/Vite construction passed; keep the existing build prompts greater than 500kB. After the local service is restarted, the 5173 and Git interface will be checked, and the final visual and button interaction will be manually experienced by the user.

## RUN-89cd5a9e Git panel save and submit

2026-10-10 / Codex / Local main. "Save Submission" is added to the Git version panel in the upper right corner: when there is a change in the workspace, save all the current branch without ignoring the changes as a local Git submission, and display the new short SHA; when it is clean, the button is disabled. Do not push, do not create/delete/switch branches, and the back-end refuses to write when the Agent dialogue is running or detached HEAD. Agent 42, front-end 20 and TypeScript/Vite construction have been passed; after restarting, check the real HTTP route and page display, and the final interaction of the button is manually experienced by the user.

## TASK018 Current three branches

The user has completed the delivery of 64366886 test and authorized collection and cleaning. Main maintains pure AI chat, including tested Mac installer, Codex App Server/MCP/Skills and access to README; testcode retains 80cb9eb user test page; release client version is currently the same as main. The running root directory is still in testcode, and the business source code/real data is not changed. Main has been collected and tested and submitted (merge c626fb64febcf53596218372d9fe0fe92cab8945); this time, README clone and three-branch instructions are synchronized separately, GitHub defaults main, and temporary branches are cleaned up according to user requirements.

|Branch|Role|Current verification/source|
| --- | --- | --- |
| main |Pure AI chat starting point, Mac installation and Codex access|The tested source is 64366886; the single chat source code is consistent with the original baseline, and the current branch sorting only changes the description.|
| testcode |Evolution page of user self-test|Keep 80cb9eb5457be76036dc92798d99903103c8fd9d, not suitable for business components|
| release |The version used by the customer|It points to the same submission as main, and all files are the same.|

The authoritative coordination record continues to be saved in the original main project .worktrees/coordination with detached HEAD; the old branch/task history is not regarded as the current active branch. The release confirmed by subsequent users is synchronized according to main→release, and the specific results can be found in the actual Git refs and the local authoritative record.

## History TASK017 GitHub Code and README Delivery

The user authorizes to upload all the source code to https://github.com/extendmachine/Saplingagent.git. This branch chore/project/github-delivery is based on TASK015 to freeze the installation candidate f1c690d8, and the new product README: GitHub acquisition/ZIP installation, personal login, in-project Codex AppServer stdio protocol, automatic MCP/Skills, model configuration, diagnosis/device code/logout, permission and authentication boundary. The original complete specification distribution instructions are folded and retained at the end of README, and the 19 rules are as they are; docs/index synchronous navigation, and the business source code has not changed.

At present, the candidate snapshot is delivered for the source code; the specific submission, push and GitHub default branch results are summarized by the authoritative records of the coordinated branch, and the candidates are frozen without filling back. The remote private empty repository has been verified, and the main/testcode/Mac candidate and repair branches have been retained, and the main has not been merged. The previous installation candidate 42 test/construction/real model verification is still seen below. At present, only document modification adopts link, command and source code consistency check, and does not pretend to be the user's own login and Intel real machine has been accepted.

## Historical TASK015 macOS Delivery Candidate

This work tree is chore/project/macos-delivery, created from main9271c18; authoritative coordination is recorded in the original main project.worktrees/coordination. Four .command, Node24.21/Codex0.146.1 installation in macOS13.5+ projects, user self-login, automatic MCP/Skills ready start-up, diagnosis and clean source code packaging have been realized. TASK016 exit cleanup repair has been integrated (source submission 29f84a93d6a4). Real Apple Silicon installation, duplicate installation, no global auth import, 42 isolation/protocol tests and TypeScript/Vite build passed. The decompression of the delivery package and the return of the real model will be checked after freezing the candidates. The final result can be found in the authoritative coordination record and delivery receipt. main/testcode remains unchanged; not released remotely; the user's manual Finder/Intel process is to be verified, and the main needs to be specified to submit the test confirmation.


## Historical Git Branch Management (TASK014)

The user authorizes to save the main single chat baseline before the current testcode and AI add functions on the web page by itself; this file is saved with the corresponding branch. The exact SHA is checked by git log -1 <branch>, and does not require its own SHA to be included in the submission. At present, only root is written, and the main working directory keeps the testcode and does not push the remote.

|Branch|Version|Verification|Main merger|Location/Execution AI|
| --- | --- | --- | --- | --- |
| testcode |The current code, including clock, project file bar, screenshot and the latest back-end interface|Save as is, credentials/temporary storage/catalog review|None (save the current version independently)|Root Directory / Codex TASK014|
| main |The starting point of the single chat restored after verification, retaining the Full Access core|Precise recovery of 15 front-end items + 9 back-end contracts; 32 inspections and construction passed|Not applicable (baseline initial saving)|Git branch object; temporary recovery copy in .cache / Codex TASK014|

The front-end 15 items come from the baseline of 5d8cf4fc-b63a-47e7-a700-a464099478ea, and SHA256 is consistent one by one; 9 back-end and shared contracts are reversed according to the successful native patch 493→433→426→414, and 22 hunk uniquely match and consistent with the independent verification hash; 4 service/interface instructions are restored according to 623→583→493. The back-end retains the user's authorized Full Access kernel, removes the file bar API and checked-write; does not rebuild the earlier protected kernel.

This time, the current running application source code or the user's session/real credentials have not been changed; data, logs, snapshots, environments, dependencies and construction products remain ignored. The current file corresponds to the main version. For details of the source and recovery boundaries, please refer to docs/git-versions.html.

## Current Task: Full Access (TASK010 to 013)

Users have clearly canceled MCP compulsory protection, and have realized danger-full-access/never, general file and shell tools, canceled directory whitelisting, forced compilation/hash threshold, one-by-one confirmation and automatic return. Root coordination TASK010, MCP011, builder012, front-end copywriting 013; retain existing user pages, sessions and local authentication, and the source code and commands are executed with the current OS user rights. The following TASK005 to 009 retains the history, and the old controlled restrictions have been replaced.

### Current baseline page

There is only one basic dialog box; there is no clock, file bar, screenshot and other post-adding components. The original front-end file is accurately restored by historical snapshots.

### This verification

- True Codex startup response: sandbox dangerFullAccess, approvePolicy never; actual gpt-5.6-sol/medium; 15 MCP, 3 Skills ready.
- The real model directly writes backend/agent-runtime/.full-access-check.txt through workspace_write_file; MCP cat and native Node command exit code 0; active page_rollback is rolledBack, the temporary file does not exist, and the approval event is 0. changeId 3c94e2ad-839a-4fc0-bef5-e6a45f639661.
- This branch restores a single chat page; testcode retains the components currently generated by the user.
- 32 isolation/protocol checks passed: agent10, workspace4, builder13, MCP1 (covering 15 tools), front4; front-end TypeScript/Vite production construction passed, and three Skills formats and independent behavior assessment passed.
- Builder overwrites any path/symbolic link/binary, old snapshot compatibility, no forced compilation or hash blocking, no start-up automatic rollback; snapshot/log failure does not prevent direct operation; timeout and stop only terminate its own command, and the real state is not confused.
- MCP official SDK verification registration failed to continue to be executed with warning, no forged taskId, HTTP canceled transmission to builder. Agent registration failure only warns, and does not misreport the completed action failure.
- 19 public rules are consistent with the source by byte; 652 public text checks do not find the real credentials of the project, and 44 HTML local links are valid.
- The browser tool refuses to access the localhost page. This time, the automatic visual retest or real screen authorization click has not been completed; the service, project file API, build and protocol test have been verified. The screenshot selector requires the user to manually authorize in the browser, and the actual experience of the new version of the user is waiting for feedback.

### The next step

This implementation and self-test is completed; users can directly request to modify the back-end, MCP, Skills or components on the existing web page, and actively restore the record as needed. There is no new permission to confirm the steps. The current service has been restarted and kept running, and the actual API is ready=true. Cloud, customer distribution and long-term layout effects have not yet been implemented.

## Historical realization (TASK005 to 009)

- TASK001/002: Specification introduction, eight concepts and architecture; TASK003 multi-panel has been replaced by 004 single page.
- TASK005: Codex App Server Real Agent, Model Selection, SSE, Continuous Thread, Request De-weighting, Cancellation, Error Recovery, Running Period Authoritative Task Registration.
- TASK006: Official stdio MCP 12 tool; three project Skills, which can be expanded through the controlled Markdown process.
- TASK007: Session/Preference Atomic JSON Persistence, Evidence, Request Ledger and Version Conflict.
- TASK008: Real candidate TypeScript/Vite construction, AST path check, complete YAML, application/hash conflict protection, snapshot/recovery.
- TASK009: assistant-ui single-page real stream/Markdown, stop/retry/new dialogue, snapshot refresh and restore, tool Chinese status and MCP confirmation; fixed chat base.

## Current delivery

Local http://127.0.0.1:5173/; unified start node scripts/dev.mjs; rely on node scripts/install.mjs for the first time; project login node scripts/login.mjs. Public configuration config/runtime.json, explain docs/runtime.html. Node≥24.11, this machine 26.4.0/Codex0.146.1, the actual model gpt-5.6-sol/medium. The global Codex configuration is not covered.

## Historical verification (TASK005 to 009)

- Real model streaming reply, MCP skills_list actual call, seed-research actual networking and official link, cross-service restart continuation memory success.
- The real reply of the browser, the refresh message retention, the refresh/events recovery during operation, and the stop button is interrupted successfully.
- The model real page_propose verification and page_apply application is successful, and the browser sees temporary components; from the chat to approve the MCP form and the real page_rollback is successful, the original App hash is restored, and the browser returns to the single chat.
- Official SDK → Real workspace/builder: Skill candidate/application/discovery/rollback, synthetic preference save and delete, secret read rejection success; test data has been withdrawn.
- 29 quarantine/protocol checks passed (agent8, workspace4, builder12, MCP1, front-end 4), TypeScript/Vite construction passed; the final test summary was handed over in TASK005; repeated no sessionId request and replayed session, conflict 409, cross-site 403. Previously, the agreement gap that MCP confirmed and rejected has been fixed to a formal form confirmation, and an authorized temporary test has actually been approved.

- Finally, after managed repair, real registration again → candidate validated → applied → cancel rolledBack, changeId 44d3225b-8c72-48e0-94d8-829befb176e4, App original hash is the same. Earlier, the model waited for the active stop and the follow-up was successful, and did not claim that the first response delay was constant.
- The AI_TASKS hash is consistent before and after the ordinary chat read-only request; modify the internal registration of the tool to binds the real MCP parameter fingerprint, and does not execute the downstream when rejecting. 19 rules are consistent with the source. The actual credentials of the public document are matched and scanned without leakage. The HTML link and the front-end life cycle log have actually been checked.

## Current boundary and follow-up

- The single-page entrance and business content are determined by the dialogue, and the existing user page is maintained. All front-end and back-end, MCP, Skills, dependencies and rules can be modified, and there is no MCP directory whitelist.
- Native and MCP files/shell are Full Access, which can modify the back-end and executable MCP; the loading changes after the process is restarted. Record the real execution results, and the user will actively return on demand. Any side effect of the command is not guaranteed to be restored.
- There is evidence that the preference has been implemented; long-term active layout improvement and effect indicators still need real use feedback.
- Customer packaging, single file self-unpacking seeds, cross-platform delivery, cloud and public release follow-up implementation.
- JS is about 706kB (gzip215kB) and there is a volume prompt. All Codex functions or long-term performance have not been verified; authentication, network and quota errors are clearly feedback.
- When the storage cannot be written, the snapshot is not saved in the process and reports failure; the process exit cannot guarantee that the last segment has not been dropped. The suspension of the initiated atomic change may be completed, subject to the change record.

## Coordination and human acceptance

Standard 2026-09-29.1. Root AI_TASKS/TODO is an authoritative record of non-Git projects; during the running period, agent-runtime tries to record the root AI_TASKS block (non-blocking), and the details are in its ai-tasks/runtime. TASK010 to 013 implementation and self-inspection have been completed, waiting for the new version of the user experience, which does not represent manual business acceptance. No Git, branch, commit, Worktree, main merge or external deployment.

The running MCP calls Agent's internal POST /internal/register-task before the actual change, and Bearer authenticates and binds the current App Server MCP item fingerprint. Before modification, project_context({modification:true}) returns taskId; read-only without registration; continue operation after the callback failure warning.

Latest modification: 2026-10-09; Codex/root TASK014 restores the main single chat baseline from the real original/patch and saves two Git versions. 32 recovery version isolation/protocol inspection and construction passed; the root working directory maintains the testcode, and the user's current page and data have not been returned. There is no remote push.

## English release preparation — TASK-20261010-013 to 018

2026-10-10 / Codex/root. English source/UI/docs/rules/Skills/installers are prepared sequentially from main 78ac3a7. 86 existing isolated checks, frontend build and synthetic browser checks pass. Project-owned source uses PolyForm Noncommercial; commercial permission and OpenAI commercial authentication are separate. Syntax/metadata, local links and source-package exclusions are checked; final package/frozen SHA and recipient-install evidence are recorded in the authoritative coordination index after creation. No main/testcode/release synchronization or external publication is claimed. Existing credentials/conversations and previous task records remain intact.

## TASK-20261011-009 through 014 — Version-compatible restart candidate

2026-10-11, Codex/root, detached .worktrees/branch-restart based on user-saved main07928eb. Runtime manager/gateway, Agent drain, frontend restart/draft/reconnect, workspace/builder drain, launcher/config/human docs implemented and self-checked with isolated tests and browser fixtures. No real inference/data/auth migration. Pending exact-version human test, main synchronization/push and first-adoption local launcher restart. Final test count and frozen SHA are recorded after freeze in .worktrees/coordination/{TODO,AI_TASKS}.md; main merge none. Other branch tips and independent canvas work preserved.
