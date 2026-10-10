# SeedAgent 单页对话入口

TASK-20261009-009 在用户要求的单页、单对话框起点上接入 agent-runtime。没有导航、画布或预置业务面板。React 19.3.0、assistant-ui 0.15.26 保留成熟聊天底座，Markdown 渲染采用 @assistant-ui/react-markdown 0.14.20。

从项目根目录运行 `node scripts/dev.mjs`，统一启动本地前后端，打开 http://127.0.0.1:5173/ 。单独启动本模块可在 front 运行 `npm ci`、`npm run dev -- --port 5173`，但还需要 agent-runtime 4310。`npm run build` 检查类型并构建，`npm test` 验证 SSE 字节和行边界。

chat/通过/api同源代理发送真实请求，显示流式文本、简洁工具进展、停止、错误和原请求重试。TASK-20261009-013适配全权限模式：AI可按当前OS用户权限读写/删除文件、执行命令并修改前后端、聊天入口、MCP或Skill；服务端不要求逐次审批或先通过候选验证。前端保留既有交互事件兼容，不自行增加确认步骤。消息持久化属于backend/workspace；浏览器仅保存当前sessionId。刷新恢复当前会话，运行中刷新通过快照与事件订阅恢复；新对话保留旧会话在后端。

main.tsx当前独立挂载聊天与App，生成内容有独立运行错误边界；这是现有结构，全权限模式允许用户通过对话调整main/chat、业务内容及其他文件。应用最初只有聊天，当前App已引用用户生成的features/CurrentTime.tsx，本次完整保留App、features与styles现状。可直接使用文件/命令工具修改，候选和手动rollback作为可选能力，实际恢复范围以变更记录为准。旧画布资料不读取或删除。

TASK009完成真实聊天基础；TASK013仅同步工具文案与当前权限说明，全权限端到端联调由根TASK010汇总。构建不代替人工体验验收。详细接口、环境、来源和交接见CONTRACT.md、DEPLOY.md、REFERENCES.md、ai-tasks/TASK-20261009-013.md；TASK009记录保留作历史。
