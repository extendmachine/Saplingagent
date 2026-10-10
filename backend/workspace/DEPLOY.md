# workspace 本地运行与恢复

环境 Node >=22；没有npm依赖安装步骤。应用根目录必须存在，启动器先创建本地token文件（权限600），服务不生成或展示其值。
从根 node backend/workspace/server.mjs，或本目录 npm start；SEED_ROOT 可切换独立种子目录，SEED_WORKSPACE_PORT 默认4311。绑定固定127.0.0.1，Ctrl+C/终止统一启动器停止。npm test 在服务目录自建临时应用根，结束移除，不污染真实会话。

检查 GET http://127.0.0.1:4311/health；业务请求仅由内部agent/MCP通过Bearer发送。确认会话刷新恢复、续聊与偏好证据，人工结果由根TODO记录。
恢复数据：停服务，完整备份 data/workspace/；JSON schema当前v1，无自动迁移。损坏JSON明确报CORRUPT_STORAGE，不能以空数据覆盖；恢复最后可信备份后再启动。快照/代码回退不应顺带回滚消息或偏好。仅支持单进程对同一存储写入。
日志自动保留30天，归项目 logs/workspace/，不在服务代码目录保存真实运行日志；所有凭据保持 local-secrets，打包须排除。
无外部发布、Git/main同步或人工验收记录。官方资料见 REFERENCES.md。
