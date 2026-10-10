# macOS候选交付说明

TASK015候选基于main9271c18单聊天起点；当前App为空，features仅README，没有用户后加组件。Node24.21 LTS安装和统一入口见../../scripts/macos/README.md、../../docs/macos-install.html。下方TASK009/013描述保留其历史语境，不作为本候选存在CurrentTime的依据。

# front 模块说明

- 模块：front / Codex/frontend；TASK009实现真实聊天，TASK013同步全权限工具文案与说明，全权限集成验证由root TASK010汇总。
- 职责：保持单页聊天入口，将用户输入经公开 HTTP 契约交给 agent-runtime，平滑展示回复和运行状态。
- 不负责：模型登录与凭据、工具执行、会话数据库、Skills 注册、源码候选验证和恢复，均由后端对应服务负责。

## 目录与边界

main.tsx当前独立挂载聊天与App，App已引用用户通过对话生成的features/CurrentTime.tsx。chat/包含ChatPanel、useSeedRuntime、runtime-api、sse、ApplicationBoundary和chat.css；styles.css及features承载应用内容。本任务保留现有业务源码，全权限模式对main/chat等文件不设置写入保护。CONTRACT/DEPLOY/REFERENCES与ai-tasks提供维护记录。

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

## GFM聊天渲染（TASK019）

新增运行依赖remark-gfm 4.0.1，安装于front/node_modules并锁定front/package.json/package-lock.json。ChatPanel的MarkdownTextPrimitive配置remarkPlugins={[remarkGfm]}，将竖线表格解析为table/thead/tbody/th/td，沿用chat.css的边框与横向滚动；同时支持GFM删除线、任务列表等语法。保留defer和现有外链/图片覆盖，不启用原始HTML或代码执行。当前main候选仍为空App的单聊天，没有新增业务组件、后端接口或CSS。

检查：TypeScript/Vite构建、4项SSE测试通过；实际ChatPanel隔离合成消息的表格DOM、列对齐、1px边框、overflow-x:auto、任务框/删除线、代码块竖线均核对通过。真实后端/用户会话未写入、模型未调用；新版本人工验收与main同步状态见权威协调索引。构建JS743.90kB/gzip225.93kB，沿用原有500kB体积提示。

## Saplingagent 更名（2026-10-09）

产品名称统一为 Saplingagent，私有包名改为 saplingagent-*。本次仅名称及展示元数据，接口、权限、模型和数据结构不变；SEED_*/SEEDAGENT_*、seedagent MCP/client ID、浏览器会话键、运行期标记和 seed-* Skill ID 保留兼容。验证和待测提交见权威 .worktrees/coordination/AI_TASKS.md；本条不代表 main 已同步。
