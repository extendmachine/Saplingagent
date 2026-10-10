# 01. 微服务架构组织项目

## 目标

所有项目必须按微服务逻辑构建。每个功能模块独立成一个文件夹存放，避免功能混杂、边界不清、后续难以维护。微服务必须从文件夹开始区分，一个层级、一个模块服务、一个目录，确保每个模块可以独立修改。

## 推荐目录结构

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

## AI 执行规则

1. 新增功能前，先判断该功能属于哪个已有服务。
2. 如果功能不属于任何现有服务，应新建独立服务文件夹，不要塞进无关模块。
3. 每个微服务必须有自己的目录，目录名应能表达服务职责。
4. 一个目录只承载一个模块服务，不把多个服务混在同一层目录中。
5. 服务之间保持低耦合，不允许跨服务直接引用内部实现。
6. 服务之间通信必须通过明确接口，例如 API、消息队列或共享契约。
7. 修改服务内部代码时，不应顺手改动其他服务，除非任务明确要求并且拆分处理。
8. 每个微服务目录内必须包含自己的 Markdown 说明文件，建议命名为 `SERVICE.md`。
9. 数据库管理可以作为独立微服务存在；其他微服务如有特殊数据管理方案，由该微服务自行说明，不做统一限制。
10. 微服务使用外部平台时，应在服务目录维护 `REFERENCES.md`。
11. 微服务任务需要跨 AI 或跨对话交接时，应在服务目录维护 `ai-tasks/<task-id>.md`。
12. 新建微服务时，按 `rules/07-service-contracts.md`、`rules/10-database-deploy-rollback.md` 和 `rules/15-official-links-and-source-traceability.md` 中的内置格式，直接在 `services/<service-name>/` 创建并填写说明文件。
13. 规范源目录预建的 `services/README.md` 随整包复制；目标项目根据真实服务创建子目录，不在规范源中预建虚假服务。

## 禁止事项

- 禁止把多个无关功能堆进同一个服务。
- 禁止多个微服务共用同一个服务目录。
- 禁止从一个服务直接导入另一个服务的私有实现。
- 禁止绕过接口约定修改其他服务内部数据。
