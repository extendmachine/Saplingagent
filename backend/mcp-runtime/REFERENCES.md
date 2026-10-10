# mcp-runtime 官方资料

| 资料 | 官方网址 | 机构/域名 | 用途 | 登录要求 | 适用版本 | 核对日期 | 任务 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MCP 构建服务文档 | https://modelcontextprotocol.io/docs/develop/build-server | MCP / modelcontextprotocol.io | stdio 协议与 stdout 限制 | 公开无需登录 | 当前文档示例采用拆分 SDK server 2.x；本实现固定兼容 SDK 1.x，见下一项 | 2026-10-09 | TASK-20261009-006 |
| 官方 TypeScript SDK 1.x server | https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md | MCP / github.com/modelcontextprotocol | McpServer registerTool、StdioServerTransport、annotations、structuredContent | 公开无需登录 | 实际 @modelcontextprotocol/sdk 1.32.1，MIT | 2026-10-09 | TASK-20261009-006 |
| 官方 TypeScript SDK 1.x client | https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/client.md | MCP / github.com/modelcontextprotocol | 协议测试的 StdioClientTransport、Client tools/list/call | 公开无需登录 | 1.32.1 | 2026-10-09 | TASK-20261009-006 |
| Zod schema API | https://zod.dev/api | Zod / zod.dev | 参数、JSON value 和有界 schema | 公开无需登录 | 实际 zod 4.6.5，MIT | 2026-10-09 | TASK-20261009-006 |
| YAML 官方 API | https://eemeli.org/yaml/ | YAML 作者 / eemeli.org | 正确读取 Skill YAML frontmatter、alias 与重复键边界 | 公开无需登录 | 实际 yaml 2.9.1，ISC | 2026-10-09 | TASK-20261009-006 |

以上在 2026-10-09 核对了可访问页面与用途，并通过 npm registry 核对实际精确安装版本。server/client 官方 SDK 协议检查已经执行；候选代码的实际构建与模型集成由各对应服务和协调任务验证。本服务不调用模型，也没有发布云端。

项目 Skills 使用本机 skill-creator：`/Users/xty/.codex/skills/.system/skill-creator/SKILL.md`；通过其 init_skill.py 创建及 quick_validate.py 验证，校验环境在本服务 `.venv/`，PyYAML 6.0.3。此绝对路径是本次本机工具来源记录，不是交付应用的运行依赖。

TASK-20261009-011 沿用以上实际依赖与协议接口，无新外部依赖。当前权限/HTTP依据为用户明确完整访问授权、根公开 contracts/runtime-api.md v2 与工具指纹 contracts/agent-tools.mjs；不是MCP规范自动授予root或可回退全部命令的声明。新版15工具使用本地已安装SDK完成隔离协议测试；Skill格式复验和独立只读行为评估完成，真实新版模型/后端集成由协调者记录。
