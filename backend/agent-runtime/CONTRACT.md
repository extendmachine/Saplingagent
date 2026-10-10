# Agent公开HTTP v2 · Full Access

任务010，取代005中的权限策略；完整字段以 contracts/runtime-api.md 为共享契约，浏览器同源/api代理。GET /health区分进程healthy和agentReady；GET /api/status返回ready/authenticated/provider/model、permissions(full-access/danger-full-access/never/approve)、项目Skills和MCP真实工具目录，不返回token。

GET /api/sessions列表；GET /api/sessions/:id返回session，包括messages、threadId、running、activeRequestId、requests及pendingApprovals。POST /api/chat {sessionId?,text,requestId?} SSE；requestId只接受字母数字下划线连字符，最长100，text1..32000字符。首次无sessionId按requestId查旧会话以免网络重试重复创建。相同requestId不同text409；并发同会话其他requestId409，已完成请求重放snapshot+done。

SSE事件session、snapshot、text_delta(itemId=持久化assistant消息id)、status、tool、approval、error、done。GET /api/events?sessionId订阅当前snapshot和未来增量；15s heartbeat；done状态仅completed/failed/interrupted；保存确认后终态。允许多个连接，不因单连接关闭取消turn。

POST /api/sessions/:id/cancel调用真实interrupt，启动前取消不发模型请求；5s RPC失败可重试。POST /api/approvals/:id {decision:accept|decline}保留既有兼容接口；当前标准MCP执行确认及native file/shell审批自动允许，不推送逐次确认表单。需要真实数据的非确认问题仍不伪造。

内部workspace接口使用本地token文件，不跨服务私有存储；运行期任务索引属于协调契约，仅维护根AI_TASKS独立标记区块、最近50条索引和本服务详情。索引写入冲突记录警告；记录失败不作为操作权限门槛。源码工具允许全部目录，用户当前授权决定动作。

无CORS，Host回环限制、拒绝未知Origin/cross-site，浏览器POST需同源；非浏览器POST须内部Bearer。错误{error:{code,message}}，400输入/格式、401内部调用认证、403跨站/Host、404不存在、409忙/去重冲突、503未就绪。运行中错误通过SSE输出，不假成功。

磁盘持续不可写可导致未落盘末段；dirty快照限同一进程内恢复，重启按磁盘状态将遗留inProgress标interrupted。Thread实际rollout归项目CODEX_HOME，本地消息正文归workspace；MCP不设目录白名单；日志/回复按项目规则不展示真实秘密，读工具不会自动扫描凭据。

运行期MCP在实际变更前调用Agent内部POST /internal/register-task，Bearer认证且绑定当前App Server MCP item指纹。修改前project_context({modification:true})尝试返回taskId；只读不登记；回调失败警告后继续。新工具workspace_write_file/delete_file/run_command同样可记录。所有thread/start/resume用danger-full-access与never，旧对话每轮收到最新权限说明，避免旧拒绝边界继续生效。
