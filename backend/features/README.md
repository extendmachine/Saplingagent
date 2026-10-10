# AI 生成的后端功能

状态：当前没有业务功能，不创建示例业务服务。
按实际 feature-id 建立目录，对应 front/features/ 下同名功能。每项真实服务补齐 SERVICE.md、CONTRACT.md、DEPLOY.md、REFERENCES.md 与 ai-tasks/。
每服务仅负责自己的业务逻辑和数据，通过公开契约调用其他服务。数据归本应用 data/ 内按服务分区；私密信息仍在 local-secrets/。
