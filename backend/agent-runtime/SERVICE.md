# agent-runtime 服务

TASK-20261009-005 / Codex/root；本地可运行开发版，人工体验见根TODO。Node >=24.11（统一环境），ESM原生HTTP。无第三方运行依赖，rpc.mjs连接本机官方Codex CLI0.146.1 App Server。

职责：模型目录/认证、持续thread/turn、SSE文本与工具进展、审批、取消、去重、断线和重启恢复；tasks.mjs负责根AI_TASKS运行期登记及本服务ai-tasks/runtime记录。文件/命令可使用Native Codex或MCP/app-builder；服务实现仍通过公开契约通信。

TASK-20261010-004在本服务增加Git版本读取与受保护切换：`git-versions.mjs`只通过参数数组调用项目内Git工作树，不拼接shell；读取当前HEAD、分支、未提交文件、最近提交和Worktree占用，并生成供底部更新提醒使用的短版本号与状态指纹。切换仅面向现有本地分支；当前分支有改动时自动暂存并提交全部未忽略文件，再切换目标。detached HEAD、活跃AI对话、并发切换或目标被其它Worktree占用时拒绝。不创建或删除分支，不stash、force、丢弃文件或操作远程。切换成功仅记录分支与短SHA，不记录文件正文或绝对路径。

默认回环4310；workspace内部HTTP4311、builder4312；浏览器通过Vite同源/api代理。统一启动node scripts/dev.mjs；单独node backend/agent-runtime/server.mjs前准备setup/workspace/builder与MCP依赖。GET /health为进程健康，GET /api/status.ready为模型/认证/MCP真正就绪，两者不同。

模型选择实际model/list目录，首选可用则选，否则目录默认；本机实际gpt-5.6-sol/medium，已真实调用。CodeX_HOME在local-secrets/codex；既有本机auth首次复制，项目auth不被覆盖。所有认证仅服务读取，API不返回账户邮箱/秘密值。

用户已选择Full Access：Codex danger-full-access + never，native shell/unified_exec启用，seedagent MCP默认approve。文件、backend、MCP、chat/main、依赖和配置无应用级保护或强制验证；标准执行确认自动接受，原生文件/命令可执行。未知交互数据不伪造输入。上传附件、计划问题表单和外部OAuth插件尚无界面；本地后端/MCP源码可修改，进程需重启加载。权限仅当前OS用户，未提权root。

数据经workspace公开接口原子持久化，API事件的snapshot为权威消息。每会话一个turn，请求账本去重。中途页面离开不取消后台；Stop真实中断；显式总时限/存储失败中止旧turn，故障保留原因；磁盘不可写时保留进程内dirty快照并明确失败。源恢复不恢复聊天。

TASK-20261010-006：turn-progress.mjs按单轮记录最后一次有效进展，默认关闭总时限（turnTimeoutMs=0，缺字段同样0），连续10分钟没有进展仅发送status提醒，用户可等待或Stop，系统不自动停止/重发。非空文本、推理、计划、工具输出/进展和有效item生命周期更新类别及时间，心跳/轮询/重连/保存/错误重试不续期。仅活动轮公开progress元数据，既有前端无需改动；不保存或广播推理原文、命令输出、MCP进度正文。静默工具状态与真实等待确认区分，Full Access标准确认保持自动放行，自由问题界面未新增。结束、取消、故障及退出清理监测计时器；可选正总时限仍真实中断。来源与字段见CONTRACT/REFERENCES，39项隔离测试通过，真实模型长期运行与人工体验待验收；并非断点续跑实现。

TASK016补充退出生命周期：收到SIGINT、SIGTERM或macOS终端关闭的SIGHUP，先停止本服务创建的独立App Server进程组；750ms后仍存活则升级SIGKILL，进程清理最多等待1500ms，不扫描或终止其他服务/用户进程。会话终态并发尽力保存为interrupted，与进程清理一起最多等待2000ms，随后取消尚未完成的workspace请求并关闭SSE/HTTP连接。关闭为幂等操作，重复信号不会跳过清理；退出中不重启App Server。持久化服务故障时仍可能有未落盘末段，下次启动继续修正遗留running状态。

日志logs/agent-runtime/agent-runtime-YYYY-MM-DD.log，跨日清理30天普通日志，仅事件、模型、ID、状态/错误类别，不记用户正文、MCP参数/结果、命令输出、原始stderr或认证。

源文件server/rpc/tasks/approval/permissions/turn-progress.mjs与git-versions.mjs；测试test/；接口CONTRACT、部署DEPLOY、来源REFERENCES、交接ai-tasks/TASK-20261009-005.md、TASK-20261010-004.md与TASK-20261010-006.md。

运行期MCP在受控变更前调用Agent内部POST /internal/register-task，Bearer认证且绑定当前App Server MCP item指纹。修改前project_context({modification:true})尝试返回taskId；只读不登记；登记失败不阻止操作。原生操作与任意命令副作用不保证可撤销；仅用户要求时恢复快照。

最新任务TASK-20261009-010 / Codex/root；旧TASK005权限方案已被本次用户明确要求取代。

## Saplingagent 更名（2026-10-09）

产品名称统一为 Saplingagent，私有包名改为 saplingagent-*。本次仅名称及展示元数据，接口、权限、模型和数据结构不变；SEED_*/SEEDAGENT_*、seedagent MCP/client ID、浏览器会话键、运行期标记和 seed-* Skill ID 保留兼容。验证和待测提交见权威 .worktrees/coordination/AI_TASKS.md；本条不代表 main 已同步。
