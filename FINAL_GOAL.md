# Saplingagent Ultimate Goal and Concept

> English translation of committed project records. Historical task statuses below retain their original time and scope. Live development ownership/progress are authoritative in the original project's .worktrees/coordination when present. This candidate does not assert human acceptance or branch synchronization.

## Project Name (2026-10-09)

After the user specifies the project, it is uniformly called **Saplingagent**; this name is used for page, running identity, installation and delivery. The original text of the historical concept and the internal protocol/status identification are retained, and the existing session does not need to be migrated.

## The ultimate goal

Make Saplingagent: With the local folder as the application boundary, users can build applications through dialogue with AI to achieve rapid application development and personalized adaptation. Long-term dialogue forms preferences, continuously adjusts the same working page, and judges and improves based on traceability and use effect.
"All apps" is a long-term product vision; the React web page is adopted in the first stage, and the native platform capabilities and adapters are defined according to the needs in the future, and it cannot be claimed that the general capabilities have been realized.

## User's original concept (2026-10-09)

1.The goal is to make a seedagent, use AI to build an application, and realize the rapid development and personalized adaptation of all apps.
2.The local terminal, including -- ai dialog box, except for the basic dialog box (a mature dialog box with open source), all other components need to be modified by AI itself. The page form simply uses the web page and follows the react framework, which is convenient for adding layout and modification.
3.ai terminal--ai can link to the server to find information, write mcp by yourself to modify yourself, and adapt yourself to user needs.
4.A minimum deployment script is required. Whenever the user needs to open a new feature, just copy a script to the local folder.
5.Remember to bring my rules to the script.
6.We will make a server in the cloud for users to upload and download the latest AI content. The cloud will not handle it for the time being.
7.Each application needs to put all its information in the local folder to ensure convenient processing and packaging, and the basic script of packaging can be written for customers.
8.Reserve several modification areas on the page, do a good job of component isolation and microservice construction, ensure the separation of front-end and back-end, and then need any users can chat with AI to complete the construction. After completion, the general back-end is saved in the corresponding position of the backend folder, and the front-end is saved in the front folder. Distinguish, the document is in docs. You can now modify the current layout to ensure that the file structure is normal.

## The requirements have been determined.

Branch agreement (TASK018, 2026-10-09): The user has completed the previous delivery version test, and only keeps the main pure AI chat, testcode user test page, and release client version (TASK018 is submitted with main; subsequent main changes are not automatically released synchronously). The tested Mac installer and AppServer access content remain in main/release; other temporary branches are deleted, and the source is retained in Git history. The user evolution content of testcode does not fit into the pure chat version.

1. The local web page uses React, and the basic dialogue entrance reuses mature open source schemes; other visible interface components are created, modified and personalized by AI.
2. The user clearly adjusts the starting point in TASK-20261009-004: initially, there is only a single web page and a dialog box, and the canvas, navigation or functional components are not preset. Subsequently, modify components and add content through AI dialogue; the canvas is no longer a necessary initial interface.
3. Local Agents can connect to external data services and generate their own MCP tools to extend and modify applications; the key is read from the local file.
4. New applications and new functions can be created through the minimum startup entrance, with rules, AI entrances and initialization status files.
5. The source code, rules, instructions, data, memory, business data, dependency list, layout version and local environment of each application belong to the application folder.
6. The front end is placed front/, the back-end is placed by service, and the human description is placed docs/; the microservice Markdown is placed in the actual service directory. Services/ As a single index, the code is not stored repeatedly.
7. In the future, customers will be provided with basic startup and packaging scripts, and the cloud content upload and download service will not be processed at this stage.

## Current authority decision (2026-10-09)

The user clearly cancels the backend/ and all file protection of Saplingagent MCP, and grants Full Access to the current system user. The whole application, basic chat, back-end, MCP, Skills, configuration and dependency can be modified, and files and shells do not need to be confirmed one by one; compilation, AST/YAML/hash check are not used as the operation threshold and do not automatically return. The original candidate/document can be recorded for the user to actively revoke; any side effect of arbitrary commands or native writing does not promise to be completely returned. The system's own permissions are still applicable, and the root is not automatically upgraded.

## macOS Installation and Delivery (TASK015, 2026-10-09)

The user has been authorized to make scripts, instructions and deliverable local source packages that currently only support macOS installation and Codex AppServer access. This candidate is created from the main single chat starting point and retains Full Access; supports macOS 13.5+ Apple Silicon/Intel, in-project Node/Codex, user self-login, automatic MCP/Skills ready start-up and clean packaging. The user's real information will not be distributed, and the recipient's status file will be initialized. Cloud, commercial SIWC and native App signature/notarization will be implemented separately.

## The scope of this task

- TASK017 (2026-10-09): The user explicitly authorizes to push all public source code branches to https://github.com/extendmachine/Saplingagent.git, and write the product README, focusing on macOS installation, my Codex login and App Server access. Use independent chore/project/github-delivery to install candidates from Mac to create the home page version, retain main/testcode and freeze candidates; at present, the remote is a private repository. The source code upload does not contain real credentials/running data, and does not represent commercial authentication, cloud operation or main merger.

- TASK005 to 009 completes real AI/MCP/Skills; TASK010 to 013 removes mandatory protection according to the user's new requirements, and retains the existing single page and user-generated business content.
- Build local Agent run, workspace persistence, Full Access file/command and optional snapshot services, MCP tools and project Skills, front-end streaming display and stop/failure processing.
- Use the local Codex App Server that has been logged in to select the models that are actually available in the directory and verify. The user subsequently decides the content of the page through the dialogue.
- The development and operation of this machine, the in-project environment, appropriate verification and document synchronization have been authorized; do not publish or build the cloud. 2026-10-09 The user explicitly authorizes to initialize the local Git in TASK014, save the current code to testcode, and the confirmed original version to main; it is not equivalent to merging the current changes to main or remote push.

## Program suggestions and matters to be selected

- The single-page front end adopts assistant-ui 0.15.26, and React Flow has been removed; React 19.3.0 / TypeScript 7.0.2 / Vite 8.3.4 has been installed and passed the construction and browser check.
- The local back-end has adopted Node.js native ESM service to collaborate with independent HTTP/stdio boundary; unified Node >=24.11 (local 26.4.0).
- The current session/preference is stored in the atomic JSON file; Codex thread and authentication running data are in the project CODEX_HOME. The SQLite business library has not been migrated.
- The four back-end responsibilities of agent-runtime, workspace, app-builder and mcp-runtime have been realized; features/are gradually established by user business dialogue.
- Three loop HTTP processes and MCP stdio processes hosted by Codex; share public contracts and do not import other services for private implementation.
- The first version is developed and run by the local macOS web page, using the local machine that has logged in Codex App Server 0.146.1; the actual model is gpt-5.6-sol/medium. See TASK015 for macOS local source packages and installation scripts; native capabilities and other platform delivery are still to be implemented.

## Acceptance direction

1. After copying the startup entrance and the attached seed data to the new directory, the complete application can be restored in the directory; it will not rely on the fixed path of the developer's computer.
2. The basic dialogue entrance can be used sustainably; AI can modify all components and back-ends; users can choose candidates/snapshots and active recovery on demand, without mandatory verification or automatic recovery.
3. The front-end and back-end are separated, the new functions correspond to the same name, and the services communicate according to the contract; the development organization follows the public service interface; MCP files and command tools do not use directory permissions to prevent source code modification.
4. The application saves the complete project data; the recovery strategy of code and data can be distinguished, packaged and carried rules, and real credentials and logs are excluded.
5. Long-term preferences, temporary requirements and user corrections can be distinguished; active layout changes are related to the basis, effect and revocation feedback.
6. If the native platform or external dependency is not realized, clearly mark the scope, and do not use "support all apps" as the completed fact.

## Don't do it now.

The local back-end, model and MCP/Skills have been implemented, and Full Access is used. TASK015 adds macOS local source package/installation and user self-login, TASK017 has authorized GitHub source code upload and access to README; cloud upload and download, external application launch and commercial SIWC certification are still not done. The follow-up shall be subject to the actual verification results of TODO.

## Current release requirements (2026-10-10)

User requests English throughout project-owned UI, prompts, installers, rules, Skills and documentation, with the same approved source content on main/testcode/release. Main is the shared development baseline; preserve old branch history. Project-owned source uses PolyForm Noncommercial 1.0.0, with separate written permission required for commercial use. Prepare a clean macOS source package; public visibility and commercial authentication are not completed by preparing the candidate. Existing user messages, credentials and private runtime data are not translated or distributed.

## Version-compatible restart (2026-10-11)
User requests bringing testcode restart capability into main and reloading both frontend and backend after a version switch. The selected checkout determines launched services; a persistent local gateway keeps control/recovery available during restart. Busy AI/writes refuse restart; only owned groups are stopped. Current UI retains an unsent draft; persisted sessions/login are preserved without resend. Legacy direct callers and old draft support have documented limits. Exact candidate acceptance and main merge remain pending; live task009–014 authority is .worktrees/coordination.
