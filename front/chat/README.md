# 基础聊天模块

TASK-20261009-009：assistant-ui 0.15.26 Thread/Message/Composer primitives 与 external-store，@assistant-ui/react-markdown 0.14.20 渲染助手 Markdown；TASK019新增remark-gfm 4.0.1，通过MarkdownTextPrimitive的remarkPlugins支持GFM表格、删除线和任务列表。初始一个输入框，无示例消息和业务组件。Enter 发送，Shift+Enter 换行；运行时停止替代发送，输入仍可编辑。

ChatPanel.tsx只负责视图。useSeedRuntime.ts管理流与状态；runtime-api.ts经/api调用公开后端契约；sse.ts按UTF-8/SSE行边界解析，50ms合并文本。snapshot避免重连重复增量。停止调用后端cancel，不先中断保存；失败显示错误并复用requestId重试。TASK013适配当前全权限模式：工具以实际OS用户权限执行，无逐次审批或强制验证要求。前端保留既有approval事件兼容，只显示服务实际发送的交互，不自行添加批准步骤。

浏览器仅保存 sessionId；刷新恢复 workspace 消息，活跃运行订阅 /api/events，订阅失效可读取保存快照。新对话保留旧后端会话。状态定期核对真实 model/ready，不模拟 AI 回复；网络头部等待有 10s 超时，已建立 SSE 不设总体回复超时。

chat.css和main.tsx当前提供独立聊天入口，App在ApplicationBoundary中挂载。全权限模式允许修改聊天入口和其他源码，没有普通写入白名单；用户生成的CurrentTime与现有布局在本次文案任务中保留。候选准备与手动恢复是可选能力。tool事件按字符串id/name/status处理，新增写入/删除/执行命令和原生fileChange不被前端阻止；commandExecution显示“执行命令”，page_propose显示“准备页面变更”。没有原画布关键词操作，不自动添加内容。

SSE 边界测试 `npm test`：跨字节中文与 emoji、CRLF/多行、末条 EOF、异常格式与心跳，已通过。真实集成及人工体验由 root TASK-005 汇总。
官方资料：https://www.assistant-ui.com/docs/runtimes/custom/external-store 、https://www.assistant-ui.com/docs/api-reference/primitives/composer 、https://www.assistant-ui.com/elements/markdown-text ，2026-10-09 已核对；实际 API 另读已安装版本类型。

TASK019：表格必须有表头分隔行（例如`| --- | --- |`），已有`.markdown-text table/th/td`样式直接生效。保留流式defer、现有链接target/rel和图片说明；代码块与行内代码中的竖线仍按代码显示，不作为表格解析。修复仅作用于助手Markdown正文，不修改用户消息或聊天运行时。
