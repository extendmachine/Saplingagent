# 11. Environmental isolation specifications in the project

## Target

All content involving the operating environment, dependent environment and container environment must belong to the current project folder to avoid mutual interference, pollution or misuse of the environment between different projects.

## General principles

1. The environment file must be placed in the project directory, not in the public place outside the project.
2. Different projects do not share virtual environments, dependent directories, container configurations or temporary running directories.
3. AI should not modify the environment files of other projects.
4. AI should not depend on the current project to be installed in the global environment of the system.
5. Environment-related instructions must be written to `SERVICE.md` or `DEPLOY.md` in the corresponding microservice directory.

## Python environment

1. The Python project must use the in-project virtual environment, and the recommended directory is `.venv/`.
2. It is not allowed to directly install project dependencies using the system Python environment.
3. Multiple projects are not allowed to share the same venv.
4. `.venv/` must add `.gitignore`.
5. Dependent files should be placed in the project or in the corresponding microservice directory, such as `requirements.txt` and `pyproject.toml`.

Recommended structure:

```text
project-root/
├── .venv/
├── services/
│   └── service-a/
│       ├── SERVICE.md
│       └── requirements.txt
└── .gitignore
```

## Docker environment

1. Dockerfile, compose file, build context and project-related container instructions must be placed in the project folder.
2. If each microservice needs Docker, it should give priority to maintaining Dockerfile in its own microservice directory.
3. Project-level arrangement files can be placed in the root directory of the project, such as `docker-compose.yml`.
4. Project mirroring, mirror naming rules and construction methods must be documented in the project, and do not rely on external unknown configurations.
5. If you need to save the built cache, exported mirror package and temporary container data, you should put it in a clear directory in the project and add `.gitignore` as needed.

Recommended structure:

```text
project-root/
├── docker-compose.yml
├── docker-images/
├── services/
│   └── service-a/
│       ├── Dockerfile
│       ├── SERVICE.md
│       └── DEPLOY.md
└── .gitignore
```

## Node or other language environments

1. Node dependency must use `node_modules/` in the project, and does not rely on global installation as a prerequisite for project operation.
2. If other languages need a virtual environment, cache directory, and dependent directory, they should also be placed in the project or clearly record the project-level path.
3. Different projects must not share the same dependent directory.

## AI execution rules

1. Before adding an environment, confirm that the environment directory is in the current project folder.
2. If it is found that the project is using an external shared environment, it should be recorded to `TODO.md` first, and then ask whether to migrate.
3. After modifying the environment configuration, you must update the corresponding `SERVICE.md` or `DEPLOY.md` of the corresponding microservice.
4. Not creating will affect the environment configuration of the system global or other projects.
5. Do not submit `.venv/`, `node_modules/`, Docker mirror package, container temporary data to git.
6. When initializing or reviewing the environment, use the "Environment Filling Format" below to check, and the final content is directly written to the corresponding microservice `SERVICE.md` or `DEPLOY.md`.

## Environment filling format

```markdown
## The environment in the project

- Service: `<SERVICE_NAME>`
- Technical stack: <Python / Node / Docker / Other>
- RUNTIME VERSION: <VERSION>
- Environment Catalog: <Project Internal Path>
- Dependency list: <requirements.txt / pyproject.toml / package.json / other>
- Configuration entrance: <Project Internal Path>
- Temporary Data Catalog: <Project Internal Path>
- Python virtual environment: <`.venv/` or not applicable>
- Node dependent directory: <`node_modules/` or not applicable in the project>
- Dockerfile: <In-project path or not applicable>
- Docker build context: <In-project path or not applicable>
- Docker mirror naming: <project/service:version or not applicable>
- Export mirror directory: <`docker-images/` or not applicable>
```

AI must delete the inapplicable items or clearly state "not applicable", and must not keep unprocessed placeholders.

## Saplingagent customer scope

For this project, rule18 distinguishes maintainer development/delivery inside the project folder from a customer's explicit request to work on external code. The default isolation guidance is not a technical path permission restriction; keep Full Access and follow the actual user-authorized scope.
