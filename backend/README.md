# Saplingagent本地后端

已实现四个独立职责，TASK005至009集成；Node原生ESM，整体Node >=24.11，统一 node scripts/dev.mjs。无云端、Git或客户分发发布。

| 服务 | 协议 | 职责 |
| --- | --- | --- |
| agent-runtime | 回环HTTP4310 + Codex JSON-RPC | 模型、SSE、持续thread、审批/取消、运行期协调登记 |
| workspace | 内部HTTP4311 | 会话/请求账本、偏好证据原子JSON |
| app-builder | 内部HTTP4312 | 全权限文件读写/删除、shell命令、可选候选与主动恢复 |
| mcp-runtime | stdio MCP | 15个工具代理公开HTTP及读取项目Skills/上下文 |
| features | 尚无预置实现 | 用户需求产生的独立业务模块 |

跨服务只用公开API/MCP，不导入私有实现/共写私有数据。MCP由Codex作为子进程管理。契约contracts/runtime-api.md及各服务CONTRACT；docs/runtime.html人类说明。状态与验证见根TODO。
