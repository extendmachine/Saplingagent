# Agent公开HTTP v2 · Full Access

任务010，取代005中的权限策略；完整字段以 contracts/runtime-api.md 为共享契约，浏览器同源/api代理。GET /health区分进程healthy和agentReady；GET /api/status返回ready/authenticated/provider/model、permissions(full-access/danger-full-access/never/approve)、项目Skills和MCP真实工具目录，不返回token。

TASK-20261010-004新增Git版本接口。GET /api/git返回当前仓库名、分支或detached状态、HEAD、`version`短版本号、`fingerprint`当前状态指纹、工作区改动（最多100项并标记截断）、本地分支、最近8项提交及分支被其它Worktree占用状态。干净时版本号为短SHA，有改动时附加指纹摘要；指纹用于页面检测状态变化，不是安全签名。POST /api/git/switch {branch}只切换到已存在且未被其它Worktree占用的本地分支；如当前命名分支有改动，先执行`git add --all`并以`chore: save <current> before switching to <target>`自动提交，再切换目标分支。当前处于detached HEAD、Agent对话运行中、并发切换或目标Worktree占用时返回409。接口不创建/删除分支，不自动stash、force/discard、远程fetch/pull/push；成功后前端应重新载入目标版本。错误使用GIT_NOT_REPOSITORY、GIT_INVALID_BRANCH、GIT_BRANCH_NOT_FOUND、GIT_DETACHED、GIT_BRANCH_IN_USE、GIT_AGENT_BUSY、GIT_SWITCH_BUSY或GIT_COMMAND_FAILED。

POST /api/git/commit用于右上面板的“保存提交”：当前工作区有改动时执行`git add --all`并创建`chore: save <branch> from Saplingagent`本地提交，返回新Git状态及`savedCommit`；已干净时不重复提交。AI对话、其它Git写操作或detached HEAD会拒绝；不执行push、fetch或任何远程操作。

GET /api/sessions列表；GET /api/sessions/:id返回session，包括messages、threadId、running、activeRequestId、requests及pendingApprovals。POST /api/chat {sessionId?,text,requestId?} SSE；requestId只接受字母数字下划线连字符，最长100，text1..32000字符。首次无sessionId按requestId查旧会话以免网络重试重复创建。相同requestId不同text409；并发同会话其他requestId409，已完成请求重放snapshot+done。

TASK-20261010-006（2026-10-10）：活动轮的公开session可额外包含可选 `progress:{startedAt,lastProgressAt,lastProgressKind,idle,phase}`；前两项为ISO时间，kind为started/text/reasoning/plan/command-output/file-output/mcp-progress/item-started/item-completed，idle为boolean，phase为working/tool-running/waiting-user。仅当前进程活动轮提供，结束后省略，不修改workspace存储schema，不代表断点续跑；不返回推理原文、命令输出或MCP参数。现有调用者可忽略新增字段。

默认 `turnTimeoutMs:0`（缺字段同样0）关闭整轮硬时限；`turnIdleWarningMs:600000`在连续10分钟没有有效进展时通过既有 `status:{label}` 提醒，运行保持running，无error/done，不自动停止、不自动重发。每段闲置只提醒一次，新进展清除idle并提示继续；GET /api/events和相同请求重连补发当前闲置/真实等待状态。SSE心跳、HTTP轮询/重连、保存、连接错误重试不更新进展。线程及轮ID严格匹配（turn/started、completed的ID为params.turn.id）；turn/start应答确认前暂缓处理通知，旧轮事件不更新进展或结束新轮。

有效进展为非空文本/推理/计划delta、不同的非空计划更新、带有效ID和已知类型的item开始/结束（重复生命周期去重）、非空命令输出或MCP progress.message。仅保存类别和时间；静默工具到闲置阈值会提示仍在运行。兼容人工审批真正待答时标为waiting-user；Full Access标准确认自动通过，不伪造成等待用户，非确认自由问题仍按现有能力明确拒绝。Stop保留真实turn/interrupt。显式正值turnTimeoutMs仍为绝对总时限，到达后真实中断并失败；两项配置只接受0..2147483647整数毫秒，0分别关闭对应计时器，非法值启动时拒绝。

SSE事件session、snapshot、text_delta(itemId=持久化assistant消息id)、status、tool、approval、error、done。GET /api/events?sessionId订阅当前snapshot和未来增量；15s heartbeat；done状态仅completed/failed/interrupted；保存确认后终态。允许多个连接，不因单连接关闭取消turn。

POST /api/sessions/:id/cancel调用真实interrupt，启动前取消不发模型请求；5s RPC失败可重试。POST /api/approvals/:id {decision:accept|decline}保留既有兼容接口；当前标准MCP执行确认及native file/shell审批自动允许，不推送逐次确认表单。需要真实数据的非确认问题仍不伪造。

内部workspace接口使用本地token文件，不跨服务私有存储；运行期任务索引属于协调契约，仅维护根AI_TASKS独立标记区块、最近50条索引和本服务详情。索引写入冲突记录警告；记录失败不作为操作权限门槛。源码工具允许全部目录，用户当前授权决定动作。

无CORS，Host回环限制、拒绝未知Origin/cross-site，浏览器POST需同源；非浏览器POST须内部Bearer。错误{error:{code,message}}，400输入/格式、401内部调用认证、403跨站/Host、404不存在、409忙/去重冲突、503未就绪。运行中错误通过SSE输出，不假成功。

磁盘持续不可写可导致未落盘末段；dirty快照限同一进程内恢复，重启按磁盘状态将遗留inProgress标interrupted。Thread实际rollout归项目CODEX_HOME，本地消息正文归workspace；MCP不设目录白名单；日志/回复按项目规则不展示真实秘密，读工具不会自动扫描凭据。

运行期MCP在实际变更前调用Agent内部POST /internal/register-task，Bearer认证且绑定当前App Server MCP item指纹。修改前project_context({modification:true})尝试返回taskId；只读不登记；回调失败警告后继续。新工具workspace_write_file/delete_file/run_command同样可记录。所有thread/start/resume用danger-full-access与never，旧对话每轮收到最新权限说明，避免旧拒绝边界继续生效。
