# 10. Database service, deployment and rollback

## Target

Database management belongs to the category of independent microservices. Each microservice can have its own special management scheme without forcing the unified database structure, migration method or deployment method. Deployment and rollback instructions should be written into the corresponding microservice directory for independent maintenance.

## Database rules

1. Database management can be used as an independent microservice.
2. Each microservice can choose its own data management scheme according to business needs.
3. Project specifications do not require database type, table structure, migration tool or seed data method.
4. If a microservice directly manages the database, it should be explained in the `SERVICE.md` of the service.
5. Customer content can be stored in the database normally according to business needs, and is not classified into the local sensitive information folder by default.

## Deployment instructions

Each microservice that needs to be deployed should record the deployment instructions in its own directory, and it is recommended to put them in:

```text
services/
└── service-a/
    ├── SERVICE.md
    └── DEPLOY.md
```

`DEPLOY.md` suggestions include:

1. Deployment environment.
2. Deployment path.
3. Start the command.
4. Rely on the service.
5. The path description of the local sensitive information file that needs to be read.
6. Pre-deployment inspection items.
7. Manual confirmation after deployment.
8. The official reference website entrance of external platforms, consoles, certificates or deployment services.

## Rollback instructions

Each microservice that needs to be deployed must have a rollback description, which can be written in `DEPLOY.md`.

The rollback instructions include:

1. Rollback version or backup location.
2. Rollback commands or manual operation steps.
3. The service status that needs to be checked after rolling back.
4. Do you need manual confirmation after rolling back?

## AI execution rules

1. When modifying the deployment method, update the `DEPLOY.md` of the microservice synchronously.
2. Do not write the deployment key, server password and API key to `DEPLOY.md`.
3. The deployment instructions only write sensitive file paths or placeholders, and do not write sensitive content.
4. When the database or deployment scheme cannot be determined, do not force unification and record it to `TODO.md` first.

## DEPLOY.md Fill in the format

```markdown
# <SERVICE_NAME> Deployment and Rollback

## Deployment information

- Deployment environment: <local / development / pre-release / production>
- In-project environment path: <`.venv/`, service directory or Docker configuration path>
- Target deployment path: <path>
- Start command: `<COMMAND>`
- Dependent services: <Service list>
- Local sensitive files: `local-secrets/<category>/<file>`

## Pre-deployment inspection

1. <Dependency, configuration and target submission check>
2. Confirm that the sensitive file only exists in `local-secrets/` and has not entered Git.
3. Confirm that the submission to be deployed is consistent with the manual test version.

## Deployment steps

1. <Step one>
2. <Step two>

## Manual confirmation after deployment

1. <Health check>
2. <Key business processes>
3. <Log and error check>

## Roll back

- ROLLABLE VERSION: `<COMMIT-OR-RELEASE>`
- Backup location: <in-project path or controlled location>
- Rollback command or step: `<COMMAND-OR-STEPS>`
- Check after rollback: <Service status and business check>
- Manual confirmation: <person in charge and result>

## External platform entrance

See `REFERENCES.md` for the specific official website, permissions and last check date.
```
