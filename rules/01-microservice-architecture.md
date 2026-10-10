# 01. Microservice architecture organization project

## Target

All projects must be built according to microservice logic. Each functional module is stored independently in a folder to avoid mixed functions, unclear boundaries, and difficult maintenance in the future. Microservices must be distinguished from folders, a hierarchy, a module service, and a directory to ensure that each module can be modified independently.

## Recommended directory structure

```text
project-root/
├── services/
│   ├── README.md
│   ├── service-a/
│   │   └── SERVICE.md
│   ├── service-b/
│   │   └── SERVICE.md
│   └── service-c/
│       └── SERVICE.md
├── docs/
├── logs/
├── local-secrets/
├── FINAL_GOAL.md
├── TODO.md
├── AI_TASKS.md
├── AGENTS.md
├── CLAUDE.md
└── rules/
    └── README.md
```

## AI execution rules

1. Before adding a new function, first determine which existing service the function belongs to.
2. If the function does not belong to any existing service, a new independent service folder should be created and not stuffed into unrelated modules.
3. Each microservice must have its own directory, and the directory name should be able to express service responsibilities.
4. A directory only carries one module service, and does not mix multiple services in the same directory.
5. Maintain low coupling between services, and do not allow cross-service direct reference to internal implementation.
6. Communication between services must be through clear interfaces, such as API, message queue or shared contract.
7. When modifying the internal code of the service, other services should not be changed by the way, unless the task is clearly required and split.
8. Each microservice directory must contain its own Markdown documentation, and it is recommended to name it `SERVICE.md`.
9. Database management can exist as an independent microservice; if other microservices have special data management schemes, the microservice will explain it by itself without unified restrictions.
10. When microservices use external platforms, `REFERENCES.md` should be maintained in the service directory.
11. When microservice tasks need to be handed over across AI or dialogues, `ai-tasks/<task-id>.md` should be maintained in the service directory.
12. When creating a new microservice, create and fill in the documentation directly in `services/<service-name>/` according to the built-in format in `rules/07-service-contracts.md`, `rules/10-database-deploy-rollback.md` and `rules/15-official-links-and-source-traceability.md`.
13. The pre-built `services/README.md` of the standardized source directory is copied with the whole package; the target project creates a subdirectory according to the real service, and does not pre-build false services in the standard source.

## Prohibited matters

- It is forbidden to stack multiple irrelevant functions into the same service.
- It is forbidden for multiple microservices to share the same service directory.
- It is forbidden to directly import private implementations from one service to another.
- It is forbidden to bypass the interface agreement to modify the internal data of other services.
