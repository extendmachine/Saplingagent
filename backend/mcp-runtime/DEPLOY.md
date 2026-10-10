# mcp-runtime 本地运行与手动恢复

## 环境与启动

- Node 22+，当前验证 Node 26.4.0；本服务 `npm ci --ignore-scripts` 安装锁定依赖到本地 node_modules。
- MCP client 命令：`node <项目绝对路径>/backend/mcp-runtime/server.mjs`。client 拥有 stdio 子进程，无额外 HTTP listener。
- 下游默认 workspace 127.0.0.1:4311、app-builder :4312；内部 token 从 local-secrets/runtime/service-token 读取，不放 args/env，不输出真实值。符号链接允许。
- launcher 可配置 SEEDAGENT_PROJECT_ROOT、SEEDAGENT_WORKSPACE_PORT、SEEDAGENT_BUILDER_PORT；managed 使用 SEED_AGENT_MANAGED=1、SEED_AGENT_PORT（默认4310）。内部主机固定回环，仍有 Bearer 认证。
- 用户授权 Full Access；协调者配置 Codex danger-full-access、approval never、seedagent MCP default_tools_approval_mode approve，并启用原生文件/shell。权限为当前 OS 用户，不自动提权 root。
- mcp_servers.seedagent.tool_timeout_sec 由协调者设为3615覆盖一小时命令；MCP signal取消传HTTP断开，下游终止对应进程组；Agent turn仍有其自身超时与停止机制。

## 启动检查与验证

1. 服务目录 `npm run check`、`npm test`；确认锁文件与实际依赖一致。TASK011 无新依赖。
2. 统一启动入口运行下游，client initialize 与 tools/list 核对15工具；skills_list/read 核对三个项目 Skill。
3. SDK 测试在本服务 .test-data 的隔离 fixture 中启动真实 stdio server；HTTP 桩只验证映射、schemas、错误与记录失败继续操作，不冒称真实 builder 或 Agent 集成。
4. 新版实际写入、命令、应用/手动恢复和模型调用由协调者分别记录；旧受控版本的确认/保护测试是历史，不能当作当前 Full Access 结果。待用户人工体验。

协议测试覆盖15工具全部调用、任意路径、分页/Base64、合法 Skill symlink、空目录与坏 Skill 区别、ready 无编译、直接写删/命令、真实错误透传、认证读取与日志脱敏。managed 普通只读不登记，成功 context 返回 ID，八个修改先回调；登记拒绝/无效 ID 后仍请求下游并给 warning。快照失败时 applied无changeId、两类warning并存被正确保留；真实SDK取消会断开下游HTTP。

三个 Skills 使用官方 skill-creator quick_validate.py 校验；独立只读行为评估确认讨论方案不写、不记偏好，授权复用流程可直接保存和按实际需要加脚本/MCP，不要求 validated 或逐次确认，不虚构 root/注册/回退能力。

## 停止、更新与恢复

client 关闭 transport 或发送 SIGTERM/SIGINT。修改 server/依赖/配置后重启相关 client/服务，再 tools/list 与真实调用核对生效；文字写入或源码保存不等于已加载能力。

文件写删的原件与记录尽力保存；SNAPSHOT_UNAVAILABLE/RECORD_UNAVAILABLE warning时可能applied无changeId，说明实际成功但无可确认恢复记录。用户主动要求时 page_changes 查已记录变更、page_rollback 恢复。恢复会覆盖后续修改，无hash防护，也不自动回退。原生文件工具、shell、网络、服务状态与业务资料副作用可能没有快照，不能保证整体撤销。写超时或断线先检查实际状态。

本服务无数据库迁移。若需手动恢复 MCP 源码，从用户选择的明确备份恢复同一套 server/package/lock 并自检；当前非 Git，无已知稳定提交/main 合并/发布。真实秘密、依赖、.venv、临时测试 fixture 和日志不是分发源码。资料见 REFERENCES.md。
