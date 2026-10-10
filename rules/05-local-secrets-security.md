# 05. Local Sensitive Information Folder Security Specification

## Target

API key, server login key, SSH key, password, token and other sensitive contents must be stored in the local independent sensitive information folder to ensure that the project code can read these files for use, but these contents will never enter git.

Users may be unable to create credential files themselves. When the user directly provides the real credentials required for the current project in the dialogue, AI shall save the `local-secrets/` of the target project on its behalf and maintain the general ledger. It shall not refuse to process it just because the credentials appear in the dialogue, or only allow the user to build the file by himself.

Customer content is not regarded as sensitive content by default. Customer information, customer project content and customer data in the business can be stored in the database normally according to the needs of the project; only login credentials, keys, tokens, passwords and other access control information are sensitive contents.

New projects may no longer use the root directory `selfdata.json` to centrally store all server passwords and keys. If the old project already exists `selfdata.json`, it should be ignored by Git and gradually migrated to the clearly classified `local-secrets/`; the ignore rule shall not be deleted before the migration is completed.

## Recommended catalog

```text
project-root/
├── local-secrets/
│   ├── README.md
│   ├── api-keys/
│   │   └── README.md
│   ├── server-keys/
│   │   └── README.md
│   ├── ssh/
│   │   └── README.md
│   └── notes/
│       ├── README.md
│       └── project-secrets.json
└── .gitignore
```

## Standard source safety skeleton

1. `0.skills项目规范/local-secrets/` is a pre-built directory skeleton required for whole package replication, which can be copied to the target project with the specification package.
2. `notes/project-secrets.json` in the specification source must keep empty project information and empty `credentials` lists, and only be used to provide legal JSON files that can be filled in directly.
3. Other taxonomic directories in the standard source only save security documentation, and do not save real server, database, API or SSH information.
4. After the copy of the target project is completed, you can directly fill in your own general ledger and classification file; once the real content is filled in, the whole directory will be managed according to sensitive information and may not be distributed or submitted to Git again.

## Project private information general ledger

1. The private information ledger of each project is stored in `local-secrets/notes/project-secrets.json`.
2. The general ledger is used to register the credential number, category, microservice, applicable environment, purpose, actual credential file path, rotation or expiration time and notes.
3. API key, password, Token, database credentials and SSH private key are stored in the corresponding classified file first; the general ledger is referenced through the relative path in the project to avoid repeating the real value in many places.
4. Information that needs to be centrally managed, such as server addresses, ports, deployment accounts, deployment paths, etc., can be saved in the general ledger or the `server-keys/` classification file referenced by it.
5. The general ledger after filling in the actual project information is a sensitive document. Like the whole `local-secrets/` of the target project, it is prohibited to submit, re-distribute, write to logs or display it completely in the AI reply; except for the empty general ledger in the standard source.
6. When adding, deleting, rotating or disabling credentials, the date, status and file reference of the general ledger must be updated synchronously.
7. At the time of initialization, directly use the JSON format to create general ledger and classification credentials files locally in the target project; only fictional placeholders can be retained in the rule file.

## Private information ledger format

The target project is created locally `local-secrets/notes/project-secrets.json`:

```json
{
  "schema_version": 1,
  "project": {
    "name": "PROJECT_NAME",
    "root": "PROJECT_ROOT",
    "last_updated": "YYYY-MM-DD",
    "maintainer": "USER_OR_AI"
  },
  "credentials": [
    {
      "id": "platform-api",
      "category": "api-key",
      "service": "SERVICE_NAME",
      "environment": "development",
      "purpose": "PURPOSE",
      "credential_file": "../api-keys/platform.json",
      "official_reference": "services/SERVICE_NAME/REFERENCES.md",
      "rotation_or_expiry": "YYYY-MM-DD_OR_NOT_APPLICABLE",
      "notes": "NOTES"
    },
    {
      "id": "production-server",
      "category": "server-login",
      "service": "SERVICE_NAME",
      "environment": "production",
      "purpose": "DEPLOYMENT",
      "credential_file": "../server-keys/server-login.json",
      "ssh_key_file": "../ssh/id_ed25519",
      "rotation_or_expiry": "YYYY-MM-DD_OR_NOT_APPLICABLE",
      "notes": "NOTES"
    }
  ]
}
```

Suggested format of API platform credentials file:

```json
{
  "platform": "PLATFORM_NAME",
  "application": "APPLICATION_NAME_OR_ID",
  "environment": "development",
  "api_key": "YOUR_API_KEY_HERE",
  "api_secret": "YOUR_API_SECRET_HERE",
  "access_token": "YOUR_ACCESS_TOKEN_HERE",
  "refresh_token": "YOUR_REFRESH_TOKEN_HERE",
  "expires_at": "YYYY-MM-DDTHH:MM:SSZ",
  "official_reference": "services/SERVICE_NAME/REFERENCES.md",
  "notes": "NOTES"
}
```

Suggested format of server login credentials file:

```json
{
  "name": "SERVER_NAME",
  "environment": "production",
  "host": "SERVER_HOST_OR_IP",
  "port": 22,
  "username": "LOGIN_USERNAME",
  "password": "LOGIN_PASSWORD_IF_USED",
  "ssh_key_file": "../ssh/id_ed25519",
  "deploy_path": "REMOTE_DEPLOY_PATH",
  "deploy_method": "DEPLOY_METHOD",
  "services": ["SERVICE_NAME"],
  "notes": "DEPLOYMENT_NOTES"
}
```

Suggested format of database credentials file:

```json
{
  "name": "DATABASE_NAME",
  "environment": "development",
  "host": "DATABASE_HOST",
  "port": 0,
  "database": "DATABASE_NAME",
  "username": "DATABASE_USERNAME",
  "password": "DATABASE_PASSWORD",
  "connection_options": "OPTIONS_OR_EMPTY",
  "owner_service": "DATABASE_SERVICE_NAME",
  "notes": "NOTES"
}
```

## Information that must be saved locally

1. API key, token, third-party platform access key.
2. Login account and password.
3. SSH key, server login key.
4. Server address, port, deployment account.
5. Deployment path, deployment method and precautions.

## Read the rules

1. The first reception allows the transfer from the conversation content currently provided by the user to the local sensitive file; after the transfer is completed, the code run, configuration and subsequent task use credentials must read the local file, and the real value must not be copied from the chat memory to the code or command.
2. It is not allowed to hardcode sensitive content into code, documents, logs or submission records.
3. It is not allowed for AI to display the real key, password and token in the progress description, final reply or verification output.
4. When examples are needed, only placeholders can be used, such as `YOUR_API_KEY_HERE`.

## Conversation credentials deposit

Users directly provide real credentials for the current project, which is regarded as authorized AI local storage and registration of the general ledger, without asking "whether to save" again. References, sample placeholders or content that the user explicitly requests not to save in the read-only review will not trigger the substitute storage. After completing the necessary task registration according to the rule index, the following process shall be carried out. The registration shall not contain secret values:

1. **Locate the target project. **Save to the `local-secrets/` of the project to which the credentials belong, and shall not be scattered to the desktop, global configuration or other items. When the current directory is a standard source `0.skills项目规范/`, real credentials are still not allowed to be stored in the template; if there is a clear target project, it is directly stored in the target project. When the project cannot be determined, only the target location is asked, and users are not required to create files by themselves or resend existing complete credentials.
2.** Prepare a protected catalog. **Automatically complete the missing catalog and `.gitignore` omissions, confirm that the actual write path is within the target project, and do not write outside the project through symbolic links. The Git project checks that the target file has not been tracked or added to the temporary storage area; the existing tracking is handled according to the leak disposal rules, and the new credentials are not written to the tracked file. macOS / Linux creates new sensitive directories and files using permissions that only the current user can access, such as directory `700` and file `600`, without recursively changing other projects or unrelated file permissions.
3.**Classify and save the original content. **API credentials are deposited in `api-keys/`, server or database login credentials are stored in `server-keys/`, and SSH private keys are stored in `ssh/`. The file name is named according to the platform, service and environment, and does not contain secret values; the original text and multi-line format of the key are retained, and the missing characters are not patched without authorization. When the project is clear but the category, purpose or environment is not clear, first save it with names such as `notes/pending-<task-id>.txt` that do not overwrite the existing file, mark to be confirmed, and do not guess the configuration or enable.
4.**Keep the existing credentials. **New credentials shall not silently overwrite existing files or switch between credentials in use. When the user has explicitly requested to replace the same credentials, update according to the authorization; otherwise, use separate files to store and retain the original files and references in use.
5.** Avoid exposure again. **Use the available secure file writing method, do not put secrets into visible command parameters, do not display content through echo, file difference preview, log or error output; do not create temporary scripts, ordinary task records or additional copies with secrets for storage. If there is a missing tool or permission that can be safely written, it is blocked truthfully and does not claim that it has been saved.
6.**Maintain the local general ledger. **Update the credential number, category, service, environment, purpose, file reference, date and status in `local-secrets/notes/project-secrets.json`, only register known information, and do not save the real value repeatedly. New credentials that are not explicitly enabled are marked as pending configuration or confirmation, and do not overwrite the original valid entries; `TODO.md`, `AI_TASKS.md` and handover files only record the processing status and non-secret file paths.
7.** Verify and give feedback. **Check the integrity, format, permissions and Git ignoring of the save by reading the file that does not echo the content, and do not call the external platform to verify the success of the save. The reply only indicates the saving path, whether the general ledger has been updated and the necessary to-do items, and does not repeatedly display the credentials; subsequent authorized tasks can be read and used from the saved files.
8.** Distinguish between deposit and other authorizations. ** Local deposit is not the same as authorizing remote login, paid call, production switching, release or credentials rotation, and the relevant operation still checks the existing task authorization. Saving locally does not mean that the copy of the dialogue has been deleted, nor does it mean that the risk of leakage has been eliminated; it can briefly remind the risk and rotation suggestions, but do not take the user's rotation first or carry the file by himself as a precondition for storage. Continue to comply with the following approval requirements when it is necessary to actually leak and dispose of it.

## Safety red line

1. The local sensitive information folder is absolutely not allowed to be submitted to git.
2. When the project is initialized, the local sensitive information folder must be written to `.gitignore` immediately.
3. Before each submission, it must be confirmed that the sensitive information folder, key file and environment variable file are not in the temporary storage area.
4. If it is found that the sensitive content has been submitted by mistake, it must immediately prevent the continuation of dissemination, and prepare and implement the historical cleaning plan; sharing history rewriting and pushing must have corresponding authorization, specifically in the order of leakage and disposal below.
5. If sensitive information has been leaked, it must be arranged to replace or revoke the password, key and token; the operation of the credentials that may be interrupted by the service must be authorized accordingly, and the authorization to repair the code shall not be regarded as the production credentials rotation authorization.

## The order of leakage and disposal

1. Immediately suspend the submission, push, publication or sharing containing secrets, record the leaked category and location, and do not display the secret value repeatedly.
2. Prepare local purification, ignore rules, historical cleaning and credentials rotation plans within the authorized scope, and reserve other modifications; work that is not affected can continue.
3. Before performing the rotation of shared history rewriting, pushing, revoking production credentials or possibly interrupting the service, check the user's authorization for specific repositories, credentials and scope of impact. If there is a clear authorization in the same scope, it can be used. Otherwise, provide the plan first and request approval.
4. Historical cleaning does not mean that the credentials are invalid; the cleaning, rotation and verification results are recorded separately. Matters that have not been authorized or cannot be completed must be kept in a pending state, and the leak shall not be claimed to have been resolved.

## AI execution rules

1. Do not actively output sensitive content in the local sensitive information folder.
2. Do not write the server password, key or token into the code, document or log.
3. When it involves deployment tasks, the lack of credentials will prompt to supplement; if the user has provided complete credentials in the dialogue, the local saving and general ledger registration will be completed directly according to the "dialogue credentials storage". The work of building directories and files will not be returned to the user, and the folder shall not be submitted.
4. Customer content is processed according to business data, and it is not automatically classified into the sensitive information folder because it is customer content.
5. Do not create a new `selfdata.json`; when old files are found, record the migration plan first, and do not directly display or submit the contents.
6. Although public keys and platform certificates are not the same as private keys, they must record the official source according to `rules/15-official-links-and-source-traceability.md`.
7. When initializing a new project, check the `local-secrets/notes/project-secrets.json` copied from the whole package and fill it in directly; only rebuild it according to this rule when the file is missing. If there are no credentials to be managed, you can keep an empty list, but you can't delete the Git ignore rule of the directory.
