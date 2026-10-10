# front 单页聊天契约

版本4；2026-10-09；TASK-20261009-013。SSE字段继续兼容TASK009；公开字段以../contracts/runtime-api.md为准，前端经HTTP调用agent-runtime。

| 接口 | 输入 | 输出及行为 |
| --- | --- | --- |
| GET /api/status | 无 | ready/authenticated/model/skills/mcp；清晰显示服务不可用或登录问题 |
| GET /api/sessions | 无 | sessions 的 id/title/updatedAt；用于确认已保存会话，不预置会话导航 |
| GET /api/sessions/:id | 浏览器保存的 sessionId | session.messages，running、activeRequestId；刷新恢复同一会话 |
| POST /api/chat | text、requestId、可选 sessionId | SSE session/text_delta/status/tool/approval/snapshot/done/error；真实流式展示 |
| GET /api/events?sessionId=... | 当前 sessionId | 活跃会话重连订阅，snapshot 覆盖后接增量；无法订阅时读取保存快照 |
| POST /api/sessions/:id/cancel | 当前 sessionId | ok；停止后等待服务最终状态，不先抛弃输出 |
| POST /api/approvals/:id | decision | 保留已有前端交互事件兼容；当前全权限工具操作无需逐次审批 |
| GET /api/project-files | path、limit、cursor | 左侧文件树按目录分页读取项目文件及absolutePath |
| GET /api/project-files/content | path、maxBytes≤4MiB | utf8内容、完整文件hash、大小、绝对地址与截断状态 |
| PUT /api/project-files/content | path、content、expectedHash、reason | 保存文本文件；磁盘已变化时409并保留本地草稿 |
| POST /api/project-files/changes/:id/rollback | 最近一次保存changeId | 用户主动恢复该次保存前版本 |

SSE 每个 data 为 JSON；text_delta 含 itemId/delta。snapshot 含完整 session，可用于幂等重试/断线恢复；done.status 是 completed/interrupted/failed。客户端按 UTF-8、SSE 行边界解析，50ms 合并增量刷新；HTTP 非成功、错误事件、意外断线分别明确处理。

发送空白不执行；运行时禁用重复发送，停止仍可用。失败重试复用原 requestId，不再追加一条用户消息；若服务仍运行，重连当前会话。单一输入框支持 Enter 发送、Shift+Enter 换行与 Markdown 文本展示。
浏览器 localStorage 仅保存 seedagent.active-session.v1 的不透明 sessionId；消息由 workspace 本地持久化。旧 seedagent.layout-preview.v1 不读、不写、不清除。浏览器不存凭据。

当前main独立挂载聊天与App。App保留CurrentTime，左侧ProjectFileExplorer可递归展开目录、预览/编辑文本、保存/放弃/恢复，并从更多菜单复制absolutePath；文件详情采用覆盖层，移动端文件树为抽屉，二进制、截断内容、symlink只读。左上ScreenshotButton通过浏览器getDisplayMedia让用户选择屏幕/窗口/标签页，抓取一帧后以带时间戳PNG下载；用户取消、浏览器不支持或捕获失败时明确提示，不上传截图。App渲染异常有独立边界；全权限模式允许修改main/chat及前后端其他文件，具体文件和命令执行由后端承担，范围为进程当前OS用户权限。

tool事件统一接受id/name/status字符串；workspace_write_file、workspace_delete_file、workspace_run_command及原生commandExecution/fileChange均能显示，不依赖page_propose/validated或approval事件才继续。后台无需逐次审批或强制验证；候选与手动page_rollback可选，实际恢复范围由app-builder变更记录说明。工具错误仍按真实error/done处理，权限放开不把失败当成功。

开发和静态预览通过Vite /api代理到默认127.0.0.1:4310；统一启动器按config/runtime.json传入SEED_AGENT_PORT，代理仅接受整数端口并固定回环主机，支持自定义Agent端口。生产静态资源部署须配置同源反向代理，不能直接拿dist文件伪称后端接入。浏览器无API key、内部服务token或Codex登录数据。
