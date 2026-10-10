# 本地运行与恢复

Node >=24.11、官方Codex CLI（本机0.146.1）、front/app-builder/mcp依赖锁文件。统一入口 node scripts/dev.mjs；首次依赖 node scripts/install.mjs。无需全局业务依赖，无云端部署。脚本位置推导根目录，端口config/runtime.json，HTTP均127.0.0.1。

setup.mjs生成local-secrets/runtime/service-token（600），项目认证目录700。首次从本机Codex auth复制到local-secrets/codex，已有不覆盖；无认证 node scripts/login.mjs，然后重启。CODEX_HOME环境仅当前子进程生效，不改变全局配置。内部服务不暴露token至浏览器。

启动status.ready必须包含实际认证/模型目录/MCP发现；目录不保证额度，实际请求可能失败。当前为Full Access，无逐次执行确认或稳定底座保护；native file/shell和MCP标准执行确认自动接受。Ctrl+C终止本次创建的服务，App Server使用自己的进程组，未知端口占用不终止他人进程。

TASK016退出处理同时支持SIGTERM与SIGHUP（关闭macOS终端）。Agent先向自身创建的App Server独立进程组发送SIGTERM，750ms后对仍存活的同组进程发送SIGKILL；进程清理最多等待1500ms，会话保存与清理并发且整体等待最多2000ms，然后取消未完成的workspace HTTP请求并关闭连接，满足统一启动器四秒停止期限。该处理仅覆盖该次spawn的进程组，不扫描端口、不向其他Codex实例或用户进程发信号；系统强制结束Agent本身仍不能保证落盘。App Server连接错误同样清理其组内后代，防止leader已退出但MCP后代遗留。

保存sessionId/threadId后可刷新或重启续聊；启动修正磁盘遗留running状态。失败同requestId重试避免重复用户消息；停止/故障中止旧turn再释放会话，进行中的原子工具操作仍以变更记录为准。应用代码恢复经page_rollback，业务数据另存。

TASK-20261010-006运行策略：config/runtime.json的turnTimeoutMs默认0，缺字段亦0，关闭整轮硬时限；turnIdleWarningMs默认600000，连续10分钟无有效进展仅提示等待/停止，不自动中断或重发。两项均需0..2147483647整数毫秒，负数/小数/字符串/null/超界值使启动拒绝，0关闭各自计时器；显式正turnTimeoutMs仍是不可续期的绝对总时限。配置加载于Agent启动，修改后重启才对新轮生效，既有运行轮不动态改策略。工具自身超时、真实Stop和错误处理仍生效。最后进展元数据仅在活动进程内，重启不是断点续跑；页面重连读取当前snapshot并补发闲置提醒。标准Full Access确认自动通过，不新增自由问题输入界面。

单元/隔离HTTP测试使用mock clock、fake AppServer和内存workspace，所有临时资料在项目.cache/turn-progress-test/，无新依赖/真实账号/模型调用。独立候选基于main ea20b59，测试提交由权威coordination登记，人工确认后才同步main；恢复旧代码需重启Agent并恢复对应公开配置，不覆盖真实会话资料。

Git版本面板调用系统已有`git`可执行文件，不新增Node依赖或全局安装。切换前自动提交当前命名分支内所有未忽略改动，提交失败则不切换；detached HEAD不自动生成悬空提交。分支切换会改变当前Worktree内受版本控制的文件；成功后浏览器重新载入目标版本，已启动的Node后端进程仍是切换前已加载代码，完整运行目标版本应按该版本入口重启。目标版本若不包含Git面板，重新载入后面板不会继续显示；可用Git命令或包含该功能的版本重新启动。接口不创建分支或操作远程。

依赖故障给真实503/error；App Server关闭后状态轮询间隔至少15s尝试重启，不伪造模型结果。日志目录与30天清理见SERVICE。系统隔离、客户种子打包和Windows/Linux上线未验证，详见根TODO。

运行期MCP在受控变更前调用Agent内部POST /internal/register-task，Bearer认证且绑定当前App Server MCP item指纹。修改前project_context({modification:true})尝试返回taskId；只读不登记；回调失败不阻止操作。源码改动按进程加载方式重启；不自动回退，主动恢复可用文件快照，命令和原生操作副作用不保证可恢复。

TASK015 macOS13.5+源包安装：根目录1-安装.command准备项目Node24.21 LTS、Codex0.146.1和锁定依赖；2-登录Codex.command由用户自行完成官方OAuth；3-启动Saplingagent.command等账号/模型/MCP与网页真正就绪再打开浏览器。SEED_CODEX_BIN指向scripts/macos/codex.sh，始终强制项目CODEX_HOME及file凭据存储，不导入全局auth。4-诊断.command仅元数据，不发模型请求。详情见../../docs/macos-install.html；这是本机开发/开源运行，商业/托管需另行SIWC。旧node开发入口保留。本任务不改FullAccess或API结构。
