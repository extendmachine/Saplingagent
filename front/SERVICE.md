# front 模块说明

- 模块：front / Codex/frontend；TASK009实现真实聊天，TASK013同步全权限工具文案与说明，全权限集成验证由root TASK010汇总。
- 职责：保持单页聊天入口，将用户输入经公开 HTTP 契约交给 agent-runtime，平滑展示回复和运行状态；同时提供项目文件树、文本详情编辑、绝对路径复制、单次保存恢复及浏览器本地截屏下载。
- 不负责：模型登录与凭据、工具执行、会话数据库、Skills 注册、源码候选验证和恢复，均由后端对应服务负责。

## 目录与边界

main.tsx当前独立挂载聊天与App，App引用features/CurrentTime.tsx、ProjectFileExplorer.tsx和ScreenshotButton.tsx。文件浏览器左侧常驻，详情编辑器按需覆盖聊天区，关闭后恢复单页聊天；窄屏使用抽屉。截屏按钮固定在左上，调用浏览器原生屏幕共享选择器并在本地下载单帧PNG，不把图像发送到后端。chat/包含ChatPanel、useSeedRuntime、runtime-api、sse、ApplicationBoundary和chat.css；styles.css及features承载应用内容。全权限模式对main/chat等文件不设置写入保护。CONTRACT/DEPLOY/REFERENCES与ai-tasks提供维护记录。

## 全权限运行方式

Agent和MCP以进程当前OS用户权限运行，提供文件读写/删除、命令执行及源码自修改，操作范围取决于实际操作系统权限。后台不要求逐次确认或强制候选验证；候选准备、应用及手动rollback仍可选。前端按通用tool事件展示进展，不筛选工具白名单，不执行文件/命令本身，也不将候选状态作为发送门槛。新的文件工具和原生commandExecution/fileChange具有对应中文文案。

## 依赖与环境

react/react-dom 19.3.0，@assistant-ui/react 0.15.26，lucide-react 1.54.0，@assistant-ui/react-markdown 0.14.20；后者用于安全 Markdown 和流式文本，不启用原始 HTML 或执行代码。typescript 7.0.2、Vite 8.3.4、React 类型 19.3.0。
已有 Node 26.4.0/npm 11.17.0，依赖仅 front/node_modules/，缓存 node_modules/.cache/，产物 dist/。不安装全局依赖。无前端 .env、API key 或内部服务 token。

## 启动与日志

推荐项目根 `node scripts/dev.mjs`；单独本模块 `npm ci`、`npm run dev -- --port 5173`。本地开发地址 http://127.0.0.1:5173/，运行前需 agent-runtime 127.0.0.1:4310。Vite /api 开发及预览代理，静态生产环境须同源反向代理。
统一启动入口将front的start/exit/error/stop结构化生命周期事件写入根 logs/front/front-YYYY-MM-DD.log，并自动清理超过30天的文件。Vite原始stdout/stderr与构建诊断显示在终端，方便直接定位启动或编译问题；生命周期文件仅记录事件，不保存原始诊断全文。日志与依赖产物不入Git。
`npm run build` 类型检查和构建，`npm test` 使用 Node 自带测试 runner，无额外测试服务或业务污染入口。

## 数据与不可用处理

浏览器仅保存 seedagent.active-session.v1 当前不透明 sessionId；消息存储在 workspace，前端不直接读其数据库。刷新读取保存会话，活跃运行恢复事件流；失败时明确显示重试或新对话。旧 seedagent.layout-preview.v1 不读取、不删除。
agent-runtime 暂不可用时输入仍可编辑，发送暂停，简洁显示状态并可重连；后台运行可停止，重复发送禁用。Markdown 不执行任意 HTML/脚本，工具进展不输出原始命令或私有路径。

## 维护入口

CONTRACT.md、DEPLOY.md、REFERENCES.md、ai-tasks/TASK-20261009-013.md；历史聊天接入见TASK009，根TASK010负责当前权限集成和人类HTML同步。
