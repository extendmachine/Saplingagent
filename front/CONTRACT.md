# front 单页聊天契约

版本4；2026-10-09；TASK-20261009-013。SSE字段继续兼容TASK009；公开字段以../contracts/runtime-api.md为准，前端经HTTP调用agent-runtime。

| 接口 | 输入 | 输出及行为 |
| --- | --- | --- |
| GET /api/status | 无 | ready/authenticated/model/skills/mcp；清晰显示服务不可用或登录问题 |
| GET /api/git | 无 | 当前仓库、分支/HEAD、短版本号与状态指纹、工作区改动、本地分支/Worktree占用和最近提交；面板及底部版本条定时刷新 |
| POST /api/git/switch | branch | 仅安全切换现有本地分支；成功返回最新Git状态并重新载入页面，409保留当前版本并显示原因 |
| GET /api/sessions | 无 | sessions 的 id/title/updatedAt；用于确认已保存会话，不预置会话导航 |
| GET /api/sessions/:id | 浏览器保存的 sessionId | session.messages，running、activeRequestId；刷新恢复同一会话 |
| POST /api/chat | text、requestId、可选 sessionId | SSE session/text_delta/status/tool/approval/snapshot/done/error；真实流式展示 |
| GET /api/events?sessionId=... | 当前 sessionId | 活跃会话重连订阅，snapshot 覆盖后接增量；无法订阅时读取保存快照 |
| POST /api/sessions/:id/cancel | 当前 sessionId | ok；停止后等待服务最终状态，不先抛弃输出 |
| POST /api/approvals/:id | decision | 保留已有前端交互事件兼容；当前全权限工具操作无需逐次审批 |

SSE 每个 data 为 JSON；text_delta 含 itemId/delta。snapshot 含完整 session，可用于幂等重试/断线恢复；done.status 是 completed/interrupted/failed。客户端按 UTF-8、SSE 行边界解析，50ms 合并增量刷新；HTTP 非成功、错误事件、意外断线分别明确处理。

发送空白不执行；运行时禁用重复发送，停止仍可用。失败重试复用原 requestId，不再追加一条用户消息；若服务仍运行，重连当前会话。单一输入框支持 Enter 发送、Shift+Enter 换行与 Markdown 文本展示。
浏览器 localStorage 仅保存 seedagent.active-session.v1 的不透明 sessionId；消息由 workspace 本地持久化。旧 seedagent.layout-preview.v1 不读、不写、不清除。浏览器不存凭据。

TASK-20261010-003错误恢复：HTTP错误保留status及error.code/message供客户端判断，对外接口字段不变。仅所选会话请求返回404且code为NOT_FOUND、message为`Session does not exist`（或明确SESSION_NOT_FOUND）时解绑该ID。列表、路由或裸404及网络/超时/401/500/503不解除指针。清理须匹配当前请求epoch、目标ID和浏览器缓存值；旧响应不能清新指针或覆盖新快照。发送/恢复确认会话缺失后保留已显示消息、text/requestId，重试仅去掉失效sessionId，由用户点击后POST；不自动发送新模型请求，也不重复追加用户消息。

当前main独立挂载聊天与App，App使用GitVersionPanel；App渲染异常有独立边界，面板错误不会替代聊天。Git切换只调用上述Agent公开接口，不处理凭据或shell，不提供stash/force/discard。选择已有分支时允许当前工作区有改动，由后端先自动提交全部未忽略文件再切换；面板显示最近已提交页面版本，但不创建或删除分支、不操作远程。全权限模式允许修改main/chat及前后端其他文件，具体通用文件和命令执行仍由后端承担，范围为进程当前OS用户权限。不存在前端工具白名单或强制保护提示。
底部VersionFooter同样只读调用GET /api/git，显示`分支 · 版本号`。它把本次页面加载时的指纹作为基线，每5秒及页面恢复可见时轮询；指纹变化后显示“发现新版本，刷新更新”，用户点击才执行浏览器刷新。完整刷新后基线更新，不自动重载或发送聊天请求。

tool事件统一接受id/name/status字符串；workspace_write_file、workspace_delete_file、workspace_run_command及原生commandExecution/fileChange均能显示，不依赖page_propose/validated或approval事件才继续。后台无需逐次审批或强制验证；候选与手动page_rollback可选，实际恢复范围由app-builder变更记录说明。工具错误仍按真实error/done处理，权限放开不把失败当成功。

开发和静态预览通过Vite /api代理到默认127.0.0.1:4310；统一启动器按config/runtime.json传入SEED_AGENT_PORT，代理仅接受整数端口并固定回环主机，支持自定义Agent端口。生产静态资源部署须配置同源反向代理，不能直接拿dist文件伪称后端接入。浏览器无API key、内部服务token或Codex登录数据。
