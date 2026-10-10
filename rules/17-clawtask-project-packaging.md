# 17. Clawtask project packaging and delivery

## Trigger and mission boundary

Users must read and execute these rules when requiring the same meaning as "please package the project as clawtask available", "package as clawtask project", "generate Clawtask import package", "adapt to Clawtask deployment", "export ZIP that can be uploaded by Clawtask", or modify existing Clawtask packaging, deployment, environment preparation, startup and health check schemes; case, spaces and natural language variants do not affect the routing, and do not require users to manually enable Skill.

1. Default delivery **conversation v2.0 group chat project source code ZIP**. Only when the user clearly selects the external Compose/staging management will he follow the old compatibility path in the attachment, and there is no need to repeatedly ask for the access type for the default scheme.
2. "Packaging as Available" authorizes necessary local adaptation, documents, packaging and security self-testing, and does not automatically authorize uploading, remote login, starting production containers, public access, publishing mirroring or merging main. When users only ask about the plan, it is delivered according to the read-only task; it has been clearly authorized not to repeat the inquiry within the same scope.
3. Follow the microservice directory, independent branch and manual confirmation process of the target project, and do not copy the Clawtask platform's own service architecture, host path or rules into the business project. The project-level packaging configuration is managed according to Rule 04, and the cross-service business modification is split according to the service.

## Read the latest Demo before each modification

The latest local Demo source directory specified by the user:

```text
/Users/xty/Desktop/projctworks/5.clawtask/tools/skills/clawtask-package/assets/demo/
```

1. Every time you modify the Clawtask-related packaging, deployment instructions, configuration or script, you must re-read the actual latest content of the directory, including subsequent corrections in the same task and continuation after interruption; you can't just follow the chat memory, old decompression cache or examples in ZIP. General business modifications that do not involve Clawtask do not trigger this item.
2. Check the directory list first, and then read `CLAWTASK_README.md`, `clawtask-package.json`, `prepare.sh`, `start.sh`, `deploy.sh`, `healthcheck.py` and the dependency list; read the new files referenced by `app.py`, `.gitignore` and README in combination with this modification. When the file name or structure changes, it is located according to the current directory and instructions, and the latest Demo is not required to maintain the old list forever.
3. At the same time, check the `SKILL.md` and `references/package-format.md` of the higher Skill root directory to confirm the preparation, start-up, tool parameters and target platform contract. The latest Demo is used for calibration implementation. It cannot replace the target business source code or expand user authorization; it does not modify the source directory and does not write the absolute path of the development machine into the business running script.
4. The specification reading receipt before modification records the actual reading path, check date, Demo declaration version (if any) and the difference from the package snapshot. The task record and delivery instructions of the target project retain the same source information; record it truthfully when there is no declared version, and do not use the file modification time to pretend to be the release version.
5. When the directory is not accessible, clearly report "the latest Demo is not checked" and ask the user to provide the latest accessible directory or a complete copy. It is not allowed to silently return to the old ZIP and claim that it conforms to the latest plan; only suspend the modification and usability conclusion of relying on the latest Demo, and continue other authorized and unaffected work. When the user clearly accepts the fixed old version, record the version range and unverified items and execute according to the scope.
6. When the behavior of Demo, Skill, ZIP snapshot or target instance is inconsistent, first list the specific differences and check the corresponding contract, and do not mix the incompatible version because the path name is the latest or the date is newer. When you need to update the tool attachment, check the script, hash and compatibility separately, and then synchronize the rules; don't just copy the new example but claim that the old tool has been upgraded.

2026-09-23 When checking, the directory is "complete deployment Demo": `prepare.sh` creates or reuses `.venv` in the target environment, `deploy.sh` is ready to start the front desk, and `start.sh` requires the environment to be prepared. After the platform basic container is opened, the script is explicitly called by AI. `startup` is for reference only, not automatically executing hooks when power-on. This paragraph is a check snapshot, which does not replace the re-reading before the next modification.

## Fixed attachments and reading entrances

- Controlled attachment: `rules/clawtask-package-skill-v2.zip`.
- Internal Skill entrance: `clawtask-package/SKILL.md`.
- Default contract: `clawtask-package/references/package-format.md`.
- Compatible path: `clawtask-package/references/legacy-compose.md`, read only when the mode is explicitly selected.
- Tools: `clawtask-package/scripts/package_project.py` and the same directory `package_contract.py`, Python 3.10+, only use the standard library.
- Sample snapshot in the attachment: `clawtask-package/assets/demo/`; It is not a real-time mirror image of the source directory above. It is used to compare the archived version and does not replace the latest Demo check before each modification.
- Source: The Clawtask platform project packaging plan provided by the user is included on 2026-09-09.
- Current attachment SHA-256: `ef903a7b70acf6501081fec3e296f058d6045780e9b30993c3154f0c1a94fd76`.

This ZIP is a toolkit for developing AI to read and run. It is not a target project delivery package, nor a Clawtask runtime Skill import package. It is a standardized controlled resource. When distributing rules, it must be copied as it is. It cannot be excluded as a build cache because the extension is ZIP. Do not nest it into the business delivery ZIP.

Read the snapshot of the package tool from the root directory of the target project; the tool execution still uses a copy in the target project, and the latest Demo check is carried out according to the source directory specified by the user above:

```sh
unzip -p rules/clawtask-package-skill-v2.zip clawtask-package/SKILL.md
unzip -p rules/clawtask-package-skill-v2.zip clawtask-package/references/package-format.md
```

For the first use, check the attachment list, CRC and SHA-256 first, and then decompress it to the independent cache directory in the project, such as `.cache/clawtask-packaging/<task-id>/`. Reject insecure paths, symbolic links, duplicate entries and abnormal volumes; do not overwrite the existing cache. It is executed after reading the script. Skill is not installed at all, and a second set of templates is not created. When the attachment is missing, damaged or hash changes, check the difference according to the rule index, and the unverified script will not be executed; the inventory of unaffected items can still be continued.

When upgrading the subsequent platform, recheck the latest Demo, attachment contract and the target platform version; when upgrading the attachment, update the attachment, the summary of this rule and the standard version synchronously. Do not only replace the file name, or rely on the old decompressed copy to continue packaging. Local verification only covers the attached snapshot and does not prove that any platform instance is compatible. The current attachment is still a fixed snapshot included in 2026-09-09, which does not mean that the complete deployment Demo of 2026-09-23 has been included; the startup instructions that are inconsistent with the checked latest plan shall not continue to be copied.

## Execution order

1. **Reading and inventory. **Read the target, progress, task claim and related service Markdown according to the rule index, first complete the above "Read the latest Demo before each modification", and then confirm the source code scope, technology stack, lock file, build product, startup entrance, port, dependency service and persistent data. The information that can be determined by the existing project is read by itself, and the general implementation details are not returned to the user.
2.**Determine the operation mode of the container. **The default source code enters the Linux container `/app`, keeps the service directory, and provides an HTTP entrance for platform forwarding. Multi-service projects explain the same container process management or authorized external dependence; an entrance is not equivalent to merging source code modules, nor is it equivalent to silently creating multiple Docker containers. When the architecture is indeed incompatible, specific differences and necessary choices are given, and it is not claimed that it can be run only by compressing the source code.
3.**Prepare to start and rely. **Provide `prepare.sh`, `start.sh`, `deploy.sh` or equivalent complete script chain and real health check according to the latest Demo. The script is compatible with POSIX `sh`, locates files from its own directory, explicitly inputs `APP_PORT` (compatible with `PORT`), listens to `0.0.0.0`, starts in the previous `exec` way, and manages long-term processes by authorized tools. The first installation and construction are separated from the daily start-up, and the preparation can be repeated without overwriting the existing environment or business data; when the dependency is missing, the failure is clear and the recovery steps are recorded. If the entrance of the Python project depends on `/app/.venv`, there must be steps to create and verify the target environment, and you can't just check the existence of `start.sh`. Do not carry macOS's `.venv/`, `node_modules/` or native binary to pretend to be Linux dependencies, and do not assume that the platform automatically creates an environment or executes the entrance.
4.**Clear operation instructions. **Prepare `CLAWTASK_README.md` in the delivery source root, and write down the runtime, first preparation, daily startup, configuration name, port, health path, data recovery, log and remaining operations. This document is a description of the platform delivery contract, which does not replace the service `DEPLOY.md` and the `docs/` HTML documents given to people; synchronize these documents according to the actual impact.
5.**Add the web footer and define the delivery manifest.**For projects with a web interface, implement the footer specified below, then maintain `clawtask-package.json` using only `title`, `goal`, `startup`, `include` and `exclude`. Use an explicit file/directory allowlist for `include`, never the whole repository `.`. The packager does not read `.gitignore`. Required frontend `dist/` may be included with the updated footer; exclude packaging caches, delivery ZIPs and real runtime data by default.
6.** Review security and data. **Check the whitelist, exclusion report and source code hard-coded credentials; real keys, `local-secrets/`, real `.env`, logs, Git history, virtual environment, dependent cache and nested archives shall not be packaged. Configuration samples without real values can be delivered. The migration scope of customer databases, materials, chats, roles and knowledge is based on user requirements and is not brought in by default; this tool only generates source code group chat packages and does not falsify identity or migrate history.
7.**Generate and verify. **Use the attachment's built-in script `build`, and then execute `validate` independently; output in the target project, such as `dist/<project>-clawtask-v2-<version>.zip`. The output file must not exist yet, rebuild with a new name, and do not directly overwrite the existing delivery version. Check the actual archive root hierarchy, entrance, file list, volume and SHA-256, and not only confirm the existence of the ZIP file.
8.**Self-inspection and delivery. ** Complete the start-up script inspection, existing construction or isolation verification that will not pollute the business data. The acceptance of the real business and the target platform will continue to collaborate manually according to Rule 09, and no special business test entrance will be built. Report package verification, local operation, real import, container readiness and public access status respectively, and deliver specific documents and the next step; the non-execution stage shall not be marked as passed.

## Deploy the logo at the bottom of the web page

1. Packaged as a project that can be used by Clawtask, as long as it contains a web interface, the deployment logo must be displayed at the bottom of the web page: [Deployed with Clawtask ↗](https://clawtask.fun/). The visible text is fixed as `Deployed with Clawtask ↗`, and the link is fixed as `https://clawtask.fun/`, which directly points to the official website of Clawtask designated by the user, and is not replaced by the deployment instance address or transit link.
2. The identification is placed in the public footer or bottom layout of the actual application, covering the route of each web page; when there is no public layout, it is supplemented at the bottom of the corresponding page. Check and reuse when the same logo is already available, and do not add it again. It cannot be written only in README, packaging receipt or docs as completion.
3. Follow the project style to keep the desktop and mobile text clear, the link can be clicked and accessed through the keyboard; do not hide, crop, use unreadable font size or obscure business content, and do not delete the original copyright, filing and other footer information. No suspension or fixed positioning is required.
4. Use real links and do not introduce SDK, tracking scripts or new dependencies for jumps. The HTML below can be used; retain the equivalent semantics when using the framework. Bring `rel="noopener noreferrer"` when the new tab is opened.

   ```html
   <a href="https://clawtask.fun/" target="_blank" rel="noopener noreferrer">Deployed with Clawtask ↗</a>
   ```

5. Include the modified web page source code and necessary reconstruction products in the delivery list. Check the identification and target link from the actual delivery of ZIP, and check the footer display and click the target of the desktop, mobile and related routes when running; only the source code string does not represent the rendering verification. When it fails to run, it records the unverified reason and manual inspection steps, and does not claim to be passed.
6. Projects without web interfaces such as pure API and command lines will not create new web pages for this purpose, and the receipt will indicate "not applicable: no web interface". Projects with web pages cannot be omitted because the old Demo or attachment has no logo; the logo belongs to local packaging adaptation, which does not mean that the real deployment has been completed, nor does it expand the upload, release or main merger authorization.

Official website source: The Clawtask official website `https://clawtask.fun/` specified by the user in this task is for the purpose of the footer brand jump, which is applicable to all Clawtask delivery projects with web pages under this rule; access to the check results and date are recorded in the task handover, and the official website is not used as the management entrance for specific deployment instances.

## v2.0 Key Points of Contract

The detailed field is subject to the attachment actually read this time. You can't write a fake manifest by hand to let the old Compose ZIP pretend to be a group chat package. The default archive root must be directly:

```text
<project>-clawtask-v2-<version>.zip
├── manifest.json
└── conversation/
    ├── meta.json
    └── workspace/
        ├── prepare.sh
        ├── start.sh
        ├── deploy.sh
        ├── healthcheck.py
        ├── CLAWTASK_README.md
        └── <Actual project source code and necessary construction products>
```

1. The `version` of `manifest.json` is the string `2.0`, and `type` is `conversation`; the source code is mapped to `/app`, and the project directory can no longer be set outside the ZIP.
2. `startup` only allows `workdir`, `entrypoint`, `container_port`, `healthcheck_path`. The first two paths are located in `/app`, and the entrance must exist in the package; the port is a JSON integer of 1-65535, and 8000 is recommended, which is not a public network port. In the current scheme, this field is an AI deployment reference and does not trigger the container start-up execution or environment variable injection. Do not write to the self-made image/build/env configuration field. The preparation, deployment and health script above represent the complete delivery plan, which can provide equivalent implementation according to the actual technology stack, not the new manifest field.
3. The health path is the single `/` starting path or `null` of this application. Real health endpoints are provided when it can be checked, and there is no need to fix the successful response to cover up the fault; when it is not applicable, it is clearly stated that the health check cannot be passed.
4. The source code package does not contain data other than the existing system mirror image or `/app`, and does not guarantee that any technology stack is not ready to start. The upper limit of the package size is 500 MiB, the total amount of expansion is 1 GiB, the entry is 20,000, and the single file is 100 MiB; encryption, duplicate paths, path crossing, links and special files are rejected.
5. The key continues to comply with Rule 05: the delivery package only contains the configuration name and security preparation instructions, and the actual credentials of the target environment are still processed according to the project local file reading scheme; it is not promised that `deploy.json.env`, the old Compose variable interface or self-made manifest fields can be injected into sandbox. Only for packaging, the user does not need to provide the production key.
6. The self-managed log of the application is still placed in the project `logs/<service>/` and kept for 30 days; the platform log path mentioned in the attached sample is only for platform diagnosis, and the project log attribution or shared host configuration is not modified accordingly.

## Tool command

First, select Python 3.10+ that is already available to establish an independent venv in the project for the packaging tool; do not overwrite the existing `.venv/` of the business project, and do not install global dependencies. The following is executed at the root of the target project. `<task-id>`, `<project>`, `<version>` must be replaced by the actual value of the current task:

```sh
python3 -m venv --without-pip ".cache/clawtask-packaging/<task-id>/.venv"
".cache/clawtask-packaging/<task-id>/.venv/bin/python" \
  ".cache/clawtask-packaging/<task-id>/clawtask-package/scripts/package_project.py" build \
  --source . --config clawtask-package.json \
  --output "dist/<project>-clawtask-v2-<version>.zip"
".cache/clawtask-packaging/<task-id>/.venv/bin/python" \
  ".cache/clawtask-packaging/<task-id>/clawtask-package/scripts/package_project.py" validate \
  "dist/<project>-clawtask-v2-<version>.zip"
```

The above example `python3` must have been verified; the self-contain version of the macOS system may not meet the conditions, so do not use it directly without checking. The two decompressed scripts must be kept in the same directory. The tool itself will not upload, install business dependencies or run project code. Security filtering cannot prove that any source code does not contain a key, and still requires manual reviewable scope check.

## Next steps of the platform

1. Verify the import entrance according to the current Demo and the target instance; 2026-09-23 Demo points to the administrator's "System Initialization → Import Packet". After uploading the generated business ZIP, wait for the import task `succeeded`; receiving the upload does not equal completion. If it fails, check the original task status first, and do not repeatedly create repeated imports.
2. Import the file into the stop container `/app`. After the user opens the basic container, the authorized AI reads `/app/CLAWTASK_README.md` and calls the preparation, deployment and health check script. The running of the basic container does not mean that the application has been started; the application still needs to be restored and verified after the container is restarted. Don't use the "Public Access" button instead of building or starting. The long-term service of the employee `cmd_executor` uses `background=true, wait_for_exit=false` according to the current Demo; limited tasks such as installation or construction confirm successful exit. External MCP operates according to the actual tool schema, do not mix these parameters, and do not treat the front desk command with timeout as permanent hosting; record the original task identification, check the status, log and health first, and then try again to avoid repeated startup.
3. After the application is ready, the user enables "public access" and fills in the application container port. Host port, loopback forwarding, Caddy, certificate and routing are managed by the platform, and are not hard-coded or modified by themselves in the package.
4. In fact, transmission, remote operation and public access are only performed by AI when the corresponding authorization is already available, otherwise the steps are delivered to the user. Provide the URL returned by the verified entrance or platform of the target instance; when unknown, it is written that it is not provided, do not create a site address, and do not block the authorized local packaging. The successful routing registration does not mean that the public network has been verified.

## Delivery receipt

In addition to the end review required by the rule index, at least:

```text
Clawtask packing receipt
- Project and mode: <project name> / conversation v2.0 or explicitly approved compatibility mode
- Tool base: rules/clawtask-package-skill-v2.zip / <actual SHA-256>
- Latest Demo Check: <Actual source path, verification date, declared version or undeclared, difference and processing with attachments>
- Delivery ZIP: <Absolute path in the target project>
- Package SHA-256: <Actual Value>
- Source version: <branch, submission; non-Git truthfully explained>
- Operation contract: <runtime, first preparation, entrance, port, health path>
- Web page deployment logo: <footer location, text and official website link, in-package check and desktop/mobile verification results; indicate that it is not applicable when there is no web page>
- Configuration and data: <Configuration name, file reading and necessary recovery steps, excluding real values>
- Verification: <List the results of package structure, security check and local operation respectively>
- Platform acceptance: <List the actual status of import, container startup and public access respectively>
- Manual next step: <Operation, verified entrance or missing information>
```

When generating and verifying ZIP only, it can be said that "packaging and local package verification are completed and waiting for platform acceptance"; it cannot be claimed that it has been deployed online. Git's manual confirmation and main synchronization still follow rule 04.

## English attachment translation (2026-10-10)

TASK-20261010-013 translates the fixed imported archive into English without upgrading the tool or its demo. The original archive SHA-256 was 92a1d30fb46975bcf18be30d5700b7f4cf8a6256d539a6c4aaed583b86f70503; the English archive SHA-256 is ef903a7b70acf6501081fec3e296f058d6045780e9b30993c3154f0c1a94fd76. Python AST structure, f-string expressions, filenames, JSON keys, archive permissions and contracts were preserved. Current original-project Demo/Skill/contracts were read on 2026-10-10: their declared snapshot date is 2026-09-23. The latest demo contains prepare/deploy/healthcheck scripts absent from this older attachment. That difference remains explicit; translation does not make the attachment a latest-demo mirror or authorize platform deployment. The permission and human-test rules retain their prior meaning in specification version 2026-10-10.1; this language-only archive revision must be included in future checks.
