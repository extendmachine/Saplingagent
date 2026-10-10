# workspace 服务说明

- 目录：backend/workspace/，TASK-20261009-007，Codex/workspace。
- 状态：实现及隔离自检完成，真实联调由 TASK-005 汇总；非 Git，无分支或提交。
- 职责：本地会话、Codex threadId、消息、运行状态、请求去重账本及有明确证据的长期偏好。通过内部 HTTP 被 agent/MCP 使用。
- 不负责模型调用、代码生成、执行工具或云端共享，不把临时要求自动当偏好。

## 结构与运行

server.mjs 回环 HTTP；store.mjs 校验/串行化/原子写；test/ 隔离测试；package.json 服务脚本，无第三方运行依赖。
Node >=22，已在项目现有 Node 26.4.0 检查。npm start 或 node backend/workspace/server.mjs；默认127.0.0.1:4311，SEED_WORKSPACE_PORT 可覆盖。SEED_ROOT 可指定种子根目录，默认从模块位置推导，无开发机绝对路径。
健康检查 GET /health。停止终端 Ctrl+C；统一进程由根启动器管理。

## 数据与接口边界

data/workspace/sessions/<uuid>.json、data/workspace/preferences.json，目录700、JSON600；单进程全局队列序列化修改，临时文件 fsync 后同目录 rename。可传 expectedRevision 阻止过期覆盖；多进程共写不支持。目录和文件拒绝符号链接。
模型续聊只经契约读写，禁止导入其他服务私有实现。会话业务数据保存在应用目录，秘密值只读取 local-secrets/runtime/service-token。服务不会输出 token/请求正文。

## 日志

logs/workspace/workspace-YYYY-MM-DD.log，info/warn/error，字段 requestId/code；启动及跨日清理30天前普通日志，不入 Git。日志不记录消息、偏好值、请求体或凭据。

契约 CONTRACT.md；启动/恢复 DEPLOY.md；来源 REFERENCES.md；交接 ai-tasks/TASK-20261009-007.md。

## Saplingagent 更名（2026-10-09）

产品名称统一为 Saplingagent，私有包名改为 saplingagent-*。本次仅名称及展示元数据，接口、权限、模型和数据结构不变；SEED_*/SEEDAGENT_*、seedagent MCP/client ID、浏览器会话键、运行期标记和 seed-* Skill ID 保留兼容。验证和待测提交见权威 .worktrees/coordination/AI_TASKS.md；本条不代表 main 已同步。
