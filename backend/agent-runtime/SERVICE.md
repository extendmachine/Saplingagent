# agent-runtime 服务

TASK-20261009-005 / Codex/root；本地可运行开发版，人工体验见根TODO。Node >=24.11（统一环境），ESM原生HTTP。无第三方运行依赖，rpc.mjs连接本机官方Codex CLI0.146.1 App Server。

职责：模型目录/认证、持续thread/turn、SSE文本与工具进展、审批、取消、去重、断线和重启恢复；tasks.mjs负责根AI_TASKS运行期登记及本服务ai-tasks/runtime记录。文件/命令可使用Native Codex或MCP/app-builder；服务实现仍通过公开契约通信。

默认回环4310；workspace内部HTTP4311、builder4312；浏览器通过Vite同源/api代理。统一启动node scripts/dev.mjs；单独node backend/agent-runtime/server.mjs前准备setup/workspace/builder与MCP依赖。GET /health为进程健康，GET /api/status.ready为模型/认证/MCP真正就绪，两者不同。

模型选择实际model/list目录，首选可用则选，否则目录默认；本机实际gpt-5.6-sol/medium，已真实调用。CodeX_HOME在local-secrets/codex；既有本机auth首次复制，项目auth不被覆盖。所有认证仅服务读取，API不返回账户邮箱/秘密值。

用户已选择Full Access：Codex danger-full-access + never，native shell/unified_exec启用，seedagent MCP默认approve。文件、backend、MCP、chat/main、依赖和配置无应用级保护或强制验证；标准执行确认自动接受，原生文件/命令可执行。未知交互数据不伪造输入。上传附件、计划问题表单和外部OAuth插件尚无界面；本地后端/MCP源码可修改，进程需重启加载。权限仅当前OS用户，未提权root。

数据经workspace公开接口原子持久化，API事件的snapshot为权威消息。每会话一个turn，请求账本去重。中途页面离开不取消后台；Stop真实中断；超时/存储失败中止旧turn，故障保留原因；磁盘不可写时保留进程内dirty快照并明确失败。源恢复不恢复聊天。

TASK016补充退出生命周期：收到SIGINT、SIGTERM或macOS终端关闭的SIGHUP，先停止本服务创建的独立App Server进程组；750ms后仍存活则升级SIGKILL，进程清理最多等待1500ms，不扫描或终止其他服务/用户进程。会话终态并发尽力保存为interrupted，与进程清理一起最多等待2000ms，随后取消尚未完成的workspace请求并关闭SSE/HTTP连接。关闭为幂等操作，重复信号不会跳过清理；退出中不重启App Server。持久化服务故障时仍可能有未落盘末段，下次启动继续修正遗留running状态。

日志logs/agent-runtime/agent-runtime-YYYY-MM-DD.log，跨日清理30天普通日志，仅事件、模型、ID、状态/错误类别，不记用户正文、MCP参数/结果、命令输出、原始stderr或认证。

源文件server/rpc/tasks/approval/permissions.mjs；测试test/；接口CONTRACT、部署DEPLOY、来源REFERENCES、交接ai-tasks/TASK-20261009-005.md。

运行期MCP在受控变更前调用Agent内部POST /internal/register-task，Bearer认证且绑定当前App Server MCP item指纹。修改前project_context({modification:true})尝试返回taskId；只读不登记；登记失败不阻止操作。原生操作与任意命令副作用不保证可撤销；仅用户要求时恢复快照。

最新任务TASK-20261009-010 / Codex/root；旧TASK005权限方案已被本次用户明确要求取代。
