# 本地运行公开契约 v2 · Full Access

TASK-20261009-010至013；2026-10-09。用户明确取消Saplingagent MCP保护，当前为完整文件/命令权限。HTTP服务agent4310/workspace4311/app-builder4312仍监听127.0.0.1并使用本地Bearer区分内部服务；浏览器同源/api代理，不持有该token。没有跨服务私有导入。

## 当前执行权限

Codex sandbox danger-full-access、approvalPolicy never；seedagent MCP default_tools_approval_mode approve。当前OS用户可访问的文件/网络/命令均可使用，不提权为root。无MCP目录、扩展名、backend/chat/main/rules或符号链接保护；支持绝对与项目相对路径。编译/候选/hash不是写入门槛；不自动回退。初始单页聊天保持现状，用户可以要求修改任何组件、后端、MCP与Skills。

## 前端 -> agent

GET /api/status -> {ready,authenticated,provider,model,skills:[{name,description}],mcp:{ready,tools:[{name,description}]},permissions:{mode:'full-access',sandbox:'danger-full-access',approvalPolicy:'never',mcpApproval:'approve'},error?}。
GET /api/git -> {git:{repository,branch,detached,head:{shortSha,sha,committedAt,subject},clean,changeCount,changes,changesTruncated,branches,recentCommits}}。读取当前项目Worktree的分支、提交、未提交文件、本地分支及其它Worktree占用状态；不访问网络。
POST /api/git/switch {branch} -> {git,reloadRecommended:true}。只接受现有本地分支；AI对话运行中、工作区不干净、另一次切换进行中或目标分支被其他Worktree占用时返回409。接口不执行stash、force、discard、fetch、pull、push或远程分支创建。
GET /api/sessions -> {sessions:[{id,title,updatedAt}]}。
GET /api/sessions/:id -> {session:{id,title,threadId,messages,updatedAt,running,activeRequestId,requests,pendingApprovals:[],progress?}}。
POST /api/chat {sessionId?,text,requestId?} -> SSE：session、snapshot、text_delta、status、tool、error、done；保留兼容approval事件与POST /api/approvals/:id，但本地权限/MCP执行自动放行，不要求逐次确认。
POST /api/sessions/:id/cancel -> {ok:true}；GET /api/events?sessionId=... -> snapshot+后续SSE。运行断线不会自动停止。会话持久化、请求去重、真实取消/错误状态保持。Stop不能撤销已经产生的文件或命令副作用。

TASK-20261010-006：`progress?`仅活动轮提供，为 `{startedAt:ISO时间,lastProgressAt:ISO时间,lastProgressKind:'started'|'text'|'reasoning'|'plan'|'command-output'|'file-output'|'mcp-progress'|'item-started'|'item-completed',idle:boolean,phase:'working'|'tool-running'|'waiting-user'}`。属于Agent内存元数据，不持久化到workspace、不返回输出/推理/工具参数，结束省略。默认总时限turnTimeoutMs=0（缺字段同样0），默认闲置提醒turnIdleWarningMs=600000；每段无有效进展通过既有status.label提醒一次，保持running、无error/done、不自动重发，进展恢复继续。重连补发当前提醒；静默工具可提示仍在运行，标准Full Access确认仍自动允许，自由问题界面未新增。心跳/轮询/重连/保存/连接错误重试不算进展，旧thread/turn事件不能续期。显式正总时限仍真实中断；两项配置只接受0..2147483647整数毫秒，0关闭对应计时器。

## MCP -> agent 运行记录

POST /internal/register-task {tool,fingerprint} -> {taskId:'RUN-<requestId>'}。Bearer内部调用，绑定当前活跃MCP调用以记录归属。project_context({modification:true})和修改工具尝试登记；登记不作为权限门槛，失败给元数据warning并继续操作，不伪造taskId。普通聊天/只读不登记。MCP配置通过显式env传项目根和端口。

## agent/MCP -> workspace

GET /health，GET /sessions -> {sessions}；POST /sessions {title?} -> {session}；GET /sessions/:id -> {session}；PATCH /sessions/:id {threadId?,messages?,title?,running?,activeRequestId?,requests?,expectedRevision?} -> {session}。
GET /preferences -> {preferences:[]}；POST /preferences {key,value,evidence} -> {preference}；DELETE /preferences/:id -> {ok:true}。偏好保留用户原话依据；workspace业务schema不属于MCP路径权限过滤。

## MCP -> app-builder

GET /health -> {ready,service,version}。
GET /files?path=.&limit=200&cursor=0 -> {files:[{path,size,type,writable:true}],truncated,nextCursor,...}。支持任何文件目录；分页是响应容量控制，不以保护路径拒绝。
GET /file?path=...&encoding=utf8|base64&offset=0&maxBytes=1048576 -> {path,content,encoding,hash,hashScope,size,offset,nextOffset,truncated,...}；maxBytes最多4MiB，读取分页不是路径权限限制。
POST /files/write {path,content,encoding?:'utf8'|'base64',reason?} -> {changeId?,status:'applied',warnings?,...}：直接写文件，尽力记录原件供手动撤销；快照失败仍写入，warning且没有可用changeId时不能承诺恢复。
POST /files/delete {path,reason?} -> {changeId?,status:'applied',warnings?,...}：删除文件，尽力记录原件；快照失败不阻止删除，目录操作可用shell。
POST /commands {command,cwd?,timeoutMs?} -> {exitCode,stdout,stderr,timedOut,cancelled,stdoutTruncated,stderrTruncated,...}：当前用户shell，无命令白名单；默认cwd项目，支持其他工作目录。默认60秒、可指定最多1小时；真实退出码、超时与取消，stdout/stderr分别1MiB输出上限并说明截断，不落盘正文。HTTP断开/请求取消/服务关闭会停止本次工具命令，不能撤销已经发生的副作用。MCP请求上限3615秒；聊天默认无整轮硬时限，闲置仅提醒，工具自身时限仍有效。
POST /changes {files:[{path,content,expectedHash?,encoding?}],reason} -> {changeId,status:'ready',checks:[],...}：可选候选记录，不编译、不执行AST/YAML/秘密文本验证、expectedHash不阻止写入。
POST /changes/:id/apply -> {changeId,status:'applied',...}；兼容旧validated/failed候选，实际文件系统错误如实返回。
POST /changes/:id/rollback -> {changeId,status:'rolledBack',...}：仅用户主动请求，不拦截后续修改，按原件覆盖恢复。GET /changes -> {changes}。

文件/删除的原件与记录在snapshots/app-builder；命令与Codex原生直接写入可以产生未记录副作用，不能承诺完整回退。服务启动不自动回退未完成的用户操作。数据损坏、系统权限不足或文件不存在是实际错误，不是应用权限策略。

## MCP目录

保留workspace_list_files/read_file、project_context、page_propose/apply/rollback/changes、preferences_get/set/forget、skills_list/read；新增workspace_write_file、workspace_delete_file、workspace_run_command，共15工具。Skills为可修改的项目流程，合法frontmatter是Codex发现格式，不作为MCP写入保护。可执行MCP源码与依赖可直接修改；运行中的进程需要重启后加载源码变化。
