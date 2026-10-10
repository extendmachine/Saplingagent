# 服务索引

实际源位置遵循用户front/backend要求，公共rules中的services示例按backend应用。本目录只作索引。

| 对象 | 目录 | 状态 |
| --- | --- | --- |
| 单页聊天 | ../front/ | 实现及自检完成，实际模型/刷新/停止已验证 |
| Agent | ../backend/agent-runtime/ | 官方App Server与真实SSE/Full Access/持续会话 |
| Workspace | ../backend/workspace/ | 原子本地会话/偏好/账本 |
| Builder | ../backend/app-builder/ | 完整文件/命令执行，可选候选与用户手动恢复 |
| MCP | ../backend/mcp-runtime/ | 15工具、三Skills，实际stdio联调 |
| 业务功能 | ../front/features/ 与 ../backend/features/ | 按后续用户对话建立，初始无预置功能 |

每项实际服务都有SERVICE/CONTRACT/DEPLOY/REFERENCES及任务交接。运行node scripts/dev.mjs；根TODO列实际验证与待人工体验。

2026-10-09最新权限：Full Access，backend、MCP、前端底座等无MCP目录保护或必测门槛；旧受控范围按TASK010至013更新。
