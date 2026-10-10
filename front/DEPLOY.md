# front 启动与恢复

## 项目内环境

Node 26.4.0 / npm 11.17.0；依赖 front/node_modules，锁定 package.json/package-lock.json；缓存 node_modules/.cache，产物 dist。配置 tsconfig.json、vite.config.ts，无前端真实凭据。Python、Docker 不适用。

## 本机启动

推荐在项目根执行 `node scripts/dev.mjs`，统一启动后端与前端；此入口由 TASK-005 维护，最终验证见根状态。访问 http://127.0.0.1:5173/ 。
单独启动前端，在 front 执行：

```sh
npm ci
npm run dev -- --port 5173
```

需另行运行 agent-runtime，默认 127.0.0.1:4310。Vite /api 代理读取 Node 的 SEED_AGENT_PORT 环境变量，默认4310，严格限定整数端口与固定127.0.0.1主机；统一启动器按 config/runtime.json 的 agentPort 传入，因此自定义端口也正确。
单独前端/preview 需要与自定义agent端口一致时，例：`SEED_AGENT_PORT=4410 npm run dev -- --port 5173` 或 `SEED_AGENT_PORT=4410 npm run preview -- --port 4173`。不从VITE_变量或浏览器存储读取服务凭据。
Vite代理保留同源请求，浏览器不读取Codex登录数据或内部服务token。绑定loopback，仅本机访问；后台不可用时显示连接状态、禁发但允许编辑。Ctrl+C停止启动终端。
统一启动器为front记录start/exit/error/stop结构化生命周期事件，文件为根 logs/front/front-YYYY-MM-DD.log，保留30天并自动清理到期文件，真实日志不入Git。Vite原始stdout/stderr继续显示在启动终端，构建诊断由执行npm run build的终端展示；这些原始诊断不会写入生命周期文件。单独运行前端不经过统一启动器，生命周期记录需自行管理；如需持久保存诊断，按项目规则另行脱敏并归属logs/front。

## 构建与验证

```sh
npm run build
npm test
npm run preview -- --port 4173
```

preview 与dev使用同一 SEED_AGENT_PORT 代理设置，默认4310。dist 是静态产物；正式静态托管必须配置同源反向代理，不能直接 file:// 打开，也没有本任务外部发布。
Git版本面板同样依赖`/api/git`和`/api/git/switch`的同源代理。切换分支会更新当前Worktree文件；Vite开发服务器可能热更新或重新载入，Node后端需重启才会载入目标分支的后端源码。切换到不包含本面板的历史版本后，页面将按该版本显示，不承诺仍保留面板入口。
前端构建与 4 条 SSE 测试通过；Node strip-only 测试使用显式属性赋值，不需要 tsx 或额外测试依赖。真实流式对话、刷新续聊、停止、MCP、Skills、自修改链路由 root TASK-005 进行集成验证，最终实际结果见根 TODO。
JS 构建块约 706 kB/gzip 215 kB，Vite 提示超过 500 kB；本地可运行，未隐藏体积提示。fsevents 可选脚本待审核，未批准执行，构建正常。

## 恢复与边界

浏览器保存 sessionId，刷新从后端恢复消息；运行中的会话恢复 SSE，订阅不可用时读取持久化快照。断线不会主动取消后台任务；停止按钮调用专用 cancel 后等待保存状态。失败重试复用 requestId，不再追加用户消息。

TASK-20261010-003：切换同源服务但使用独立本地数据时，原sessionId可能在新服务中不存在。客户端收到明确的会话404后提示并解绑匹配旧ID；保留原输入，用户点击重试或发送新消息才创建会话。不搬移或删除旧应用的会话，不自动调用模型。暂时断网、超时、500/503及接口路由404继续保留ID；其他标签已保存的新ID不被此次失效清理删除。合成回归与构建已完成，实际浏览器体验及候选同步main仍需按权威任务记录验收。
新对话仅解除当前浏览器选择，旧消息留在 workspace。消息正文不放入 localStorage，旧画布状态不读取或清除。
本macOS候选沿用main的空App和单聊天起点，main/chat与App仍独立挂载，App使用ErrorBoundary。本次未改动App/features/styles。全权限运行允许AI在进程当前OS用户可访问的范围直接读写/删除文件、执行命令和修改源码，main/chat等文件不设置写入保护，不要求逐次审批或强制候选验证。候选准备、应用与手动rollback可选，恢复依据实际变更记录。前端只通过Agent展示请求与进展；执行和权限配置由后端承担。当前非Git，没有提交、合并或人工验收记录。

macOS13.5+客户本机安装使用根目录.command入口，具体见../../docs/macos-install.html及../../scripts/macos/README.md；自动固定项目Node24.21 LTS，依赖按锁文件安装。无新接口或前端业务改动。
