# mcp-runtime 服务说明

## 基本信息

- 职责：真实 stdio MCP 入口，提供文件、命令、候选记录、手动恢复、偏好证据和 Skills。
- 实际目录：backend/mcp-runtime/；项目起点仍是单网页单对话框。
- 当前任务：TASK-20261009-011，Codex/mcp；协调 TASK-20261009-010；初始实现历史 TASK-20261009-006。
- 状态：新版实现、协议自检、Skills 格式与独立行为评估完成；新版实际 Agent/后端集成由协调者记录，待人工体验。

## 当前权限与职责

用户明确授权完整访问。15 个工具支持当前 OS 用户可访问的文件与 shell；允许绝对路径、父级路径、符号链接、前后端、聊天底座、main、MCP、Skills 和依赖。不自动提权为 root。没有路径/扩展名白名单、编译或 hash 写入门槛；候选记录可选，ready 不代表验证。变更恢复由用户主动发起，按快照原件覆盖后续修改；shell/原生工具/网络副作用不能保证全部回退。

直接写删仅尽力保存快照；快照或记录失败不阻止 OS 允许的操作，可能返回 applied + warnings 而没有 changeId，不能保证该次手动恢复。命令取消从 MCP signal 传递 HTTP 断开，builder 据此终止对应进程组；已经完成的副作用不会撤销。

MCP 不承担模型流式通信、会话存储或云端仓库。文件与命令通过 app-builder 的公开 HTTP 接口执行，不导入其他服务私有实现。Skill 文本不会自动安装或注册新的可执行工具；MCP/后端源码修改需进程重启后核对实际效果。

## 实现与依赖

`server.mjs` 使用 Node ESM，最低 Node 22，当前已验证 Node 26.4.0。生产依赖位于本服务 node_modules，精确锁定官方 @modelcontextprotocol/sdk 1.32.1、Zod 4.6.5 和 YAML 2.9.1；TASK011 无新依赖。官网主示例的拆分 SDK 2.x 与本实现稳定 1.x 不混用。

YAML 解析与名称格式用于 Skills 发现，不是文件写入保护。三个项目 Skills 位于 `.agents/skills/`。官方 skill-creator 格式检查使用本服务 `.venv/`（Python 3.14.7 / PyYAML 6.0.3），不属于生产运行依赖。

- 启动：MCP client 执行 `node <项目绝对路径>/backend/mcp-runtime/server.mjs`，不依赖 cwd。
- 自检：服务目录 `npm run check`、`npm test`；后者使用官方 SDK 的真实 stdio client 和隔离 HTTP 测试桩。
- 停止：client 关闭 transport，或发送 SIGTERM/SIGINT。无 MCP HTTP listener，无另一个常驻服务端口。

## 服务依赖

| 服务 | 接口 | 用途 | 不可用时 |
| --- | --- | --- | --- |
| agent-runtime / Codex App Server | MCP stdio client | 启动、发现、调用 | client 如实处理连接状态 |
| workspace | 127.0.0.1:4311 HTTP | 带证据偏好读/写/遗忘 | 返回真实依赖错误 |
| app-builder | 127.0.0.1:4312 HTTP | 任意文件/命令、候选/应用/恢复 | 返回真实依赖或系统错误 |
| agent-runtime 记录 | managed 模式 127.0.0.1:4310 或 SEED_AGENT_PORT | 修改前记录归属 | 失败给 warning 并继续已授权操作 |

公开契约为根 `contracts/runtime-api.md` v2；归属指纹从公开 `contracts/agent-tools.mjs` 导入。所有内部 HTTP 仍固定回环、Bearer 认证、拒绝重定向；启动器通过 env 配置项目根和三个端口。令牌从 `local-secrets/runtime/service-token` 文件读取，允许符号链接，不进入普通日志或自动上下文。

## 数据与日志

会话/偏好归 workspace，原件与变更记录归 app-builder，Skill 指引归项目 `.agents/skills/`。MCP 不直接管理其他服务的数据存储。

日志在 `logs/mcp-runtime/mcp-runtime-YYYY-MM-DD.log`，普通日志保留 30 天，首次记录与跨日清理过期匹配文件。字段仅 time、level、tool、code；不落参数、命令、文件内容、偏好原文、凭据或返回正文。登记失败单独记 TASK_REGISTRATION_FAILED。stdout 严格用于 MCP 协议，stderr 只给固定脱敏启动失败说明；日志失败不改变操作结果。

接口见 CONTRACT.md；部署见 DEPLOY.md；资料见 REFERENCES.md；交接见 ai-tasks/。
